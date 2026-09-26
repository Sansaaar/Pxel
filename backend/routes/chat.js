// Pixel AI Chat Route: POST /api/chat

const crypto = require("node:crypto");
const express = require("express");
const router = express.Router();

const db = require("../database/messages");
const supabase = require("../database/supabase");
const aiService = require("../services/aiService");
const memory = require("../memory/conversations");
const { MODELS, resolveModel, isProviderConfigured } = require("../config/models");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "js", "ts", "jsx", "tsx", "py", "java", "cpp", "c", "h", "html", "css"]);
const IMAGE_SIGNATURES = {
    "image/png": bytes => bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")),
    "image/jpeg": bytes => bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    "image/gif": bytes => bytes.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/),
    "image/webp": bytes => bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
};
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

function clientError(res, status, code, message) {
    return res.status(status).json({ success: false, error: { code, message } });
}

function validateAttachment(attachment) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment)) {
        throw new Error("An attachment is malformed.");
    }
    const name = typeof attachment.name === "string" ? attachment.name.trim() : "";
    const extension = name.split(".").pop().toLowerCase();
    if (!name || name.length > 180 || /[\\/\u0000-\u001f]/.test(name)) {
        throw new Error("An attachment name is invalid.");
    }

    if (typeof attachment.type === "string" && attachment.type.startsWith("image/")) {
        const type = attachment.type.toLowerCase();
        const match = typeof attachment.data === "string" && attachment.data.match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/]+={0,2})$/i);
        if (!IMAGE_SIGNATURES[type] || !match || match[1].toLowerCase() !== type) {
            throw new Error("An image attachment is invalid.");
        }
        const bytes = Buffer.from(match[2], "base64");
        if (!bytes.length || bytes.length > MAX_ATTACHMENT_BYTES || !IMAGE_SIGNATURES[type](bytes)) {
            throw new Error("An image attachment is invalid or too large.");
        }
        return { name, type, size: bytes.length, data: attachment.data, isImage: true };
    }

    if (!TEXT_EXTENSIONS.has(extension) || typeof attachment.content !== "string" || attachment.content.length > 500_000) {
        throw new Error("Only supported image and text files can be attached.");
    }
    return {
        name,
        type: typeof attachment.type === "string" ? attachment.type.slice(0, 100) : "text/plain",
        size: Buffer.byteLength(attachment.content, "utf8"),
        content: attachment.content,
        isImage: false
    };
}

async function resolveChatScope(req, conversationId) {
    const auth = req.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token) {
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) {
            let persistent = false;
            try {
                const { data: conversation, error: lookupError } = await supabase
                    .from("conversations")
                    .select("user_id")
                    .eq("id", conversationId)
                    .maybeSingle();
                if (!lookupError && conversation) {
                    if (conversation.user_id !== data.user.id) return { denied: true };
                    persistent = true;
                }
            } catch (lookupError) {
                console.warn("[Pixel Chat] Conversation ownership lookup failed:", lookupError.message);
            }
            return { key: `user:${data.user.id}:${conversationId}`, userId: data.user.id, persistent };
        }
    }

    const sessionId = req.get("x-pixel-session-id");
    const safeSessionId = typeof sessionId === "string" && UUID.test(sessionId)
        ? sessionId
        : crypto.randomUUID();
    return { key: `guest:${safeSessionId}:${conversationId}`, persistent: false };
}

function sanitizeHistory(history) {
    if (!Array.isArray(history) || history.length > 19) {
        throw new Error("Conversation history is invalid.");
    }
    let totalCharacters = 0;
    return history.map(message => {
        if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string" || message.content.length > 20_000) {
            throw new Error("Conversation history is invalid.");
        }
        totalCharacters += message.content.length;
        if (totalCharacters > 120_000) throw new Error("Conversation history is too large.");
        return { role: message.role, content: message.content, attachments: [] };
    });
}

function preserveMatchingAttachments(history, previousHistory) {
    let previousIndex = 0;
    return history.map(message => {
        const matchIndex = previousHistory.findIndex((previous, index) =>
            index >= previousIndex && previous.role === message.role && previous.content === message.content
        );
        const match = matchIndex >= 0 ? previousHistory[matchIndex] : null;
        if (match) previousIndex = matchIndex + 1;
        return { ...message, attachments: Array.isArray(match?.attachments) ? match.attachments : [] };
    });
}

router.post("/clear", async (req, res) => {
    const conversationId = req.body?.conversationId;
    if (typeof conversationId !== "string" || !UUID.test(conversationId)) {
        return clientError(res, 400, "INVALID_REQUEST", "A valid conversation ID is required.");
    }
    try {
        const scope = await resolveChatScope(req, conversationId);
        if (scope.denied) return clientError(res, 403, "CONVERSATION_FORBIDDEN", "This conversation belongs to another account.");
        memory.clearConversation(scope.key);
        if (scope.persistent) await db.clearConversation(conversationId);
        return res.json({ success: true });
    } catch (error) {
        console.error("[Pixel Chat] Could not clear conversation:", error);
        return clientError(res, 500, "SERVER_ERROR", "Unable to clear this conversation right now.");
    }
});

router.post("/", async (req, res) => {
    let clientDisconnected = false;
    const providerAbortController = new AbortController();
    res.on("close", () => {
        if (!res.writableEnded) {
            clientDisconnected = true;
            providerAbortController.abort();
        }
    });

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        return clientError(res, 400, "INVALID_REQUEST", "The request body must be an object.");
    }

    const { conversationId } = body;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const model = body.model === undefined ? "auto" : body.model;
    if (typeof conversationId !== "string" || !UUID.test(conversationId)) {
        return clientError(res, 400, "INVALID_REQUEST", "A valid conversation ID is required.");
    }
    if (typeof model !== "string" || model.length > 100 || !resolveModel(model)) {
        return clientError(res, 400, "INVALID_MODEL", "Choose a supported AI model.");
    }
    if (message.length > 20_000) {
        return clientError(res, 413, "MESSAGE_TOO_LARGE", "Messages must be 20,000 characters or fewer.");
    }

    const rawAttachments = body.attachments === undefined ? [] : body.attachments;
    if (!Array.isArray(rawAttachments) || rawAttachments.length > 4) {
        return clientError(res, 400, "INVALID_ATTACHMENT", "Attach up to four supported files per message.");
    }

    let submittedHistory = null;
    if (body.history !== undefined || body.replaceHistory === true) {
        try {
            submittedHistory = sanitizeHistory(body.history);
        } catch {
            return clientError(res, 400, "INVALID_HISTORY", "The conversation history is invalid or too large.");
        }
    }

    let attachments;
    try {
        attachments = rawAttachments.map(validateAttachment);
        const combinedSize = attachments.reduce((total, item) => total + item.size, 0);
        if (combinedSize > MAX_ATTACHMENT_BYTES) throw new Error("Combined attachment size exceeds 5 MB.");
    } catch (error) {
        return clientError(res, 400, "INVALID_ATTACHMENT", error.message);
    }

    let trimmedMessage = message;
    if (!trimmedMessage && attachments.length > 0) {
        trimmedMessage = attachments.some(item => item.isImage)
            ? "Please analyze this image and explain what you see."
            : "Please analyze the attached file(s).";
    }
    if (!trimmedMessage) {
        return clientError(res, 400, "INVALID_REQUEST", "Enter a message or attach a supported file.");
    }

    const selectedKey = resolveModel(model);
    if (selectedKey !== "auto" && !isProviderConfigured(MODELS[selectedKey].provider)) {
        return clientError(res, 503, "MODEL_UNAVAILABLE", "That model is not configured on this server.");
    }
    const hasImages = attachments.some(item => item.isImage);
    if (selectedKey !== "auto" && hasImages && !["gemini-3.5-flash-lite", "meta/llama-3.2-11b-vision-instruct"].includes(selectedKey)) {
        return clientError(res, 400, "MODEL_UNSUPPORTED_ATTACHMENT", "Choose a vision-capable model to analyze images.");
    }

    let scope;
    try {
        scope = await resolveChatScope(req, conversationId);
    } catch (error) {
        console.warn("[Pixel Chat] Session lookup failed:", error.message);
        scope = { key: `guest:${crypto.randomUUID()}:${conversationId}`, persistent: false };
    }
    if (scope.denied) {
        return clientError(res, 403, "CONVERSATION_FORBIDDEN", "This conversation belongs to another account.");
    }

    if (body.replaceHistory === true) {
        try {
            const truncateFrom = typeof body.truncateFrom === "string" ? new Date(body.truncateFrom) : null;
            if (!truncateFrom || Number.isNaN(truncateFrom.getTime())) {
                return clientError(res, 400, "INVALID_HISTORY", "The conversation edit could not be applied.");
            }
            const existingHistory = memory.getConversation(scope.key);
            memory.replaceConversation(scope.key, preserveMatchingAttachments(submittedHistory, existingHistory));
            if (scope.persistent) {
                try {
                    await db.deleteMessagesFrom(conversationId, truncateFrom.toISOString());
                } catch (error) {
                    console.warn("[Pixel Chat] Could not update saved conversation history:", error.message);
                }
            }
        } catch (error) {
            return clientError(res, 400, "INVALID_HISTORY", "The conversation edit could not be applied.");
        }
    } else if (submittedHistory) {
        const existingHistory = memory.getConversation(scope.key);
        memory.replaceConversation(scope.key, preserveMatchingAttachments(submittedHistory, existingHistory));
    }

    memory.addMessage(scope.key, "user", trimmedMessage, attachments);
    if (scope.persistent) {
        db.saveMessage(conversationId, "user", trimmedMessage).catch(error => {
            console.warn("[Pixel Chat] User message persistence failed:", error.message);
        });
    }

    try {
        const stream = await aiService.generate(scope.key, trimmedMessage, model, (usedModel, fallback) => {
            res.setHeader("X-Pixel-Model", usedModel);
            res.setHeader("X-Pixel-Fallback", fallback ? "true" : "false");
        }, providerAbortController.signal);

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");

        let fullReply = "";
        for await (const token of stream) {
            if (clientDisconnected) break;
            if (!token) continue;
            fullReply += token;
            res.write(token);
        }

        if (fullReply.trim()) {
            memory.addMessage(scope.key, "assistant", fullReply);
            if (scope.persistent) {
                db.saveMessage(conversationId, "assistant", fullReply).catch(error => {
                    console.warn("[Pixel Chat] Assistant message persistence failed:", error.message);
                });
            }
        }
        res.end();
    } catch (error) {
        if (clientDisconnected || providerAbortController.signal.aborted) return;
        console.error("[Pixel AI Chat Error]:", error);
        if (res.headersSent) {
            if (!clientDisconnected) res.end("\n\n*(Generation interrupted. Please retry.)*");
            return;
        }
        if (error.code === "MODEL_UNSUPPORTED_ATTACHMENT") {
            return clientError(res, 400, error.code, "Choose a vision-capable model to analyze images.");
        }
        if (error.code === "INVALID_MODEL") {
            return clientError(res, 400, error.code, "Choose a supported AI model.");
        }
        if (error.code === "MODEL_UNAVAILABLE" || error.status === 408 || error.status === 429 || error.status === 404 || error.status >= 500 || error.name === "AbortError" || error.name === "TimeoutError") {
            return clientError(res, 503, "MODEL_UNAVAILABLE", "That model is temporarily unavailable. Try Auto or another model.");
        }
        return clientError(res, 500, "SERVER_ERROR", "Something went wrong. Please try again.");
    }
});

module.exports = router;
