// ==========================================
// Pixel AI Chat Route: POST /api/chat
// ==========================================

const express = require("express");
const router = express.Router();

const db = require("../database/messages");
const aiService = require("../services/aiService");
const memory = require("../memory/conversations");

router.post("/", async (req, res) => {
    let clientDisconnected = false;

    res.on("close", () => {
        if (!res.writableEnded) {
            clientDisconnected = true;
        }
    });

    try {
        const { conversationId, message, model, attachments } = req.body;

        const rawAttachments = Array.isArray(attachments) ? attachments : [];
        let trimmedMessage = typeof message === "string" ? message.trim() : "";

        // If user provided no text but uploaded files/images, provide an appropriate default
        if (!trimmedMessage && rawAttachments.length > 0) {
            const hasImages = rawAttachments.some(a => a.type && a.type.startsWith("image/"));
            trimmedMessage = hasImages ? "Please analyze this image and explain what you see." : "Please analyze the attached file(s).";
        }

        if (!conversationId || (!trimmedMessage && rawAttachments.length === 0)) {
            return res.status(400).json({
                success: false,
                error: {
                    code: "INVALID_REQUEST",
                    message: "conversationId and a message or attachment are required."
                }
            });
        }

        // 1. Save user message to in-memory conversation context with attachments
        memory.addMessage(conversationId, "user", trimmedMessage, rawAttachments);

        // 2. Safely attempt DB persistence (non-blocking for UI responsiveness)
        db.saveMessage(conversationId, "user", trimmedMessage).catch(err => {
            console.warn("[Database] Failed to persist user message:", err.message);
        });

        // 3. Generate AI response stream
        const stream = await aiService.generate(conversationId, trimmedMessage, model);

        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Transfer-Encoding", "chunked");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");

        let fullReply = "";

        for await (const token of stream) {
            if (clientDisconnected) {
                console.log("[Pixel AI] Client disconnected early, aborting stream.");
                break;
            }

            if (!token) continue;

            fullReply += token;
            res.write(token);
        }

        // 4. Record assistant reply in memory & database
        if (fullReply.trim()) {
            memory.addMessage(conversationId, "assistant", fullReply);

            db.saveMessage(conversationId, "assistant", fullReply).catch(err => {
                console.warn("[Database] Failed to persist assistant reply:", err.message);
            });
        }

        res.end();

    } catch (err) {
        console.error("[Pixel AI Chat Error]:", err);

        if (!res.headersSent) {
            const isUnavailable = err.message && (err.message.includes("404") || err.message.includes("unavailable") || err.message.includes("quota") || err.message.includes("demand"));
            return res.status(500).json({
                success: false,
                error: {
                    code: isUnavailable ? "MODEL_UNAVAILABLE" : "SERVER_ERROR",
                    message: isUnavailable
                        ? "The selected model is currently unavailable or high in demand. Please try another model."
                        : "Something went wrong processing your request. Please try again."
                }
            });
        } else {
            res.write("\n\n*(Generation interrupted due to a temporary network issue)*");
            res.end();
        }
    }
});

module.exports = router;