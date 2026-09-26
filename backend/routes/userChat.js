// ==========================================
// Pixel AI: Direct User Chat & Chat Room Router
// Provides secure endpoints with JWT Bearer Token verification
// and strict conversation membership checks.
// ==========================================

const express = require("express");
const crypto = require("node:crypto");
const router = express.Router();
const supabase = require("../database/supabase");
const store = require("../database/userChatStore");
const streamTickets = new Map();
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
    "image/png", "image/jpeg", "image/gif", "image/webp",
    "application/pdf", "application/json",
    "text/plain", "text/markdown", "text/csv",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm",
    "video/mp4", "video/webm"
]);

const publicChatErrors = new Set([
    "Invalid room code. Please check and try again.",
    "Room not found.",
    "Only the room creator can set the topic.",
    "Only the room creator can delete this room.",
    "Conversation or room not found.",
    "Access denied to this conversation.",
    "Access denied.",
    "Message not found.",
    "You can only edit your own messages.",
    "You can only delete your own messages or room messages as owner.",
    "Only the room owner can pin messages.",
    "Invalid attachment path.",
    "Attachment not found in this conversation."
]);

function publicErrorMessage(error, status) {
    console.error("[UserChat Router] Request failed:", error?.message || error);
    if (publicChatErrors.has(error?.message)) return error.message;
    if (status === 403) return "You do not have access to this conversation.";
    if (status === 401) return "Please sign in again.";
    return "Unable to complete this request. Check the details and try again.";
}

// ── Authentication & Profile Synchronization ─────
async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const token = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null;

    if (token) {
        try {
            const { data: { user }, error } = await supabase.auth.getUser(token);
            if (user && !error) {
                const displayName = user.user_metadata?.display_name ||
                    user.user_metadata?.full_name ||
                    (user.email ? user.email.split("@")[0] : "Pixel User");

                return await store.registerOrUpdateUser({
                    id: user.id,
                    email: user.email || `${user.id}@pixel.local`,
                    display_name: displayName,
                    avatar: displayName.trim().charAt(0).toUpperCase()
                });
            }
        } catch (e) {
            console.warn("[UserChat Router] Token validation error:", e.message);
        }
    }

    return null;
}

// ── Auth & Profile Sync Endpoint ─────────────────
router.post("/auth", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: "Authentication required." });
        }
        return res.json({ success: true, user });
    } catch (err) {
        return res.status(500).json({ success: false, error: "Authentication sync failed." });
    }
});

router.post("/stream-ticket", async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
    const now = Date.now();
    for (const [ticket, entry] of streamTickets) {
        if (now >= entry.expiresAt) streamTickets.delete(ticket);
    }
    const ticket = crypto.randomBytes(32).toString("base64url");
    streamTickets.set(ticket, { user, expiresAt: now + 30_000 });
    return res.json({ success: true, ticket });
});

// ── Presence Ping ─────────────────────────────────
router.post("/ping", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Unauthorized." });
        await store.pingOnline(user.id);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── Search Users ──────────────────────────────────
router.get("/users", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
        const users = await store.searchUsers(req.query.q || "", user.id);
        return res.json({ success: true, users });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── User Conversations List ───────────────────────
router.get("/conversations", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Please sign in to view conversations." });
        const conversations = await store.getUserConversations(user.id);
        return res.json({ success: true, conversations });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── Start Direct Chat ─────────────────────────────
router.post("/direct", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        const { targetUserId } = req.body;

        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
        if (!targetUserId) return res.status(400).json({ success: false, error: "targetUserId is required." });

        const targetUser = await store.getUser(targetUserId);
        if (!targetUser) return res.status(404).json({ success: false, error: "Target user not found." });

        const conversation = await store.getOrCreateDirectConversation(user, targetUser);
        return res.json({ success: true, conversation });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── Room Creation ─────────────────────────────────
router.post("/rooms/create", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const room = await store.createRoom({
            roomName: req.body.roomName || "Pixel Room",
            owner: user,
            topic: req.body.topic
        });
        return res.json({ success: true, room });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── Room Joining ──────────────────────────────────
router.post("/rooms/join", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
        if (!req.body.roomCode) return res.status(400).json({ success: false, error: "roomCode is required." });

        const room = await store.joinRoom({ roomCode: req.body.roomCode, user });
        return res.json({ success: true, room });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Room Topic Update ─────────────────────────────
router.post("/rooms/topic", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const room = await store.updateRoomTopic({
            roomCode: req.body.roomCode,
            topic: req.body.topic,
            userId: user.id
        });
        return res.json({ success: true, room });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Room Deletion ─────────────────────────────────
router.post("/rooms/delete", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        await store.deleteRoom({ roomCode: req.body.roomCode, userId: user.id });
        return res.json({ success: true, message: "Room deleted successfully." });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Room Participants ─────────────────────────────
router.get("/rooms/participants", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const { roomCode } = req.query;
        if (!roomCode) return res.status(400).json({ success: false, error: "roomCode parameter required." });

        const participants = await store.getRoomParticipants(roomCode, user.id);
        return res.json({ success: true, participants });
    } catch (err) {
        return res.status(403).json({ success: false, error: publicErrorMessage(err, 403) });
    }
});

// ── Messages Fetching ─────────────────────────────
router.get("/messages", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Please sign in to view messages." });

        const { chatId, limit, before } = req.query;
        if (!chatId) return res.status(400).json({ success: false, error: "chatId parameter required." });

        const isMember = await store.checkConversationMember(chatId, user.id);
        if (!isMember) {
            return res.status(403).json({ success: false, error: "You are not a member of this conversation." });
        }

        const messages = await store.getMessages(chatId, user.id, parseInt(limit) || 100, before || null);
        return res.json({ success: true, messages });
    } catch (err) {
        return res.status(403).json({ success: false, error: publicErrorMessage(err, 403) });
    }
});

// ── Message Sending (POST /api/chat/messages & POST /api/user-chat/send) ──
async function handleSendMessage(req, res) {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) {
            return res.status(401).json({ success: false, error: "Please sign in again." });
        }

        const { chatId, content, attachments, replyTo } = req.body;

        if (!chatId) {
            return res.status(400).json({ success: false, error: "Conversation ID is required." });
        }

        if (!content?.trim() && (!attachments || attachments.length === 0)) {
            return res.status(400).json({ success: false, error: "Message cannot be empty." });
        }

        const isMember = await store.checkConversationMember(chatId, user.id);
        if (!isMember) {
            return res.status(403).json({ success: false, error: "You are not a member of this conversation." });
        }

        // DERIVE SENDER IDENTITY FROM VERIFIED USER ONLY
        const message = await store.sendMessage({
            chatId,
            sender: user,
            content: content || "",
            attachments: Array.isArray(attachments) ? attachments : [],
            replyTo: replyTo || null
        });

        return res.json({ success: true, message });
    } catch (err) {
        console.error("[UserChat Router] Send message error:", err.message);
        return res.status(500).json({ success: false, error: "Unable to send message." });
    }
}

router.post("/send", handleSendMessage);
router.post("/messages", handleSendMessage); // Alias route

// ── Emoji Reactions ───────────────────────────────
router.post("/react", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const result = await store.toggleMessageReaction({
            chatId: req.body.chatId,
            messageId: req.body.messageId,
            emoji: req.body.emoji,
            userId: user.id
        });
        return res.json({ success: true, reactions: result.reactions });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Message Edit ──────────────────────────────────
router.post("/edit", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const msg = await store.editMessage({
            chatId: req.body.chatId,
            messageId: req.body.messageId,
            userId: user.id,
            newContent: req.body.newContent
        });
        return res.json({ success: true, message: msg });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Message Delete ────────────────────────────────
router.post("/delete-message", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        await store.deleteMessage({
            chatId: req.body.chatId,
            messageId: req.body.messageId,
            userId: user.id
        });
        return res.json({ success: true, message: "Message deleted." });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Clear Chat History ────────────────────────────
router.post("/clear-history", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        await store.clearChatHistory({ chatId: req.body.chatId, userId: user.id });
        return res.json({ success: true, message: "History cleared." });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Typing Indicator ──────────────────────────────
router.post("/typing", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false });

        await store.setTyping({
            chatId: req.body.chatId,
            userId: user.id,
            userName: user.display_name,
            isTyping: !!req.body.isTyping
        });
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── Pin / Unpin Message ───────────────────────────
router.post("/pin", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const result = await store.togglePinMessage({
            chatId: req.body.chatId,
            messageId: req.body.messageId,
            userId: user.id
        });
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(400).json({ success: false, error: publicErrorMessage(err, 400) });
    }
});

// ── Get Pinned Messages ───────────────────────────
router.get("/pinned", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const messages = await store.getPinnedMessages(req.query.chatId, user.id);
        return res.json({ success: true, messages });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

// ── File Upload Signed URL ────────────────────────
router.post("/upload-url", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const { fileName, contentType, fileSize, chatId } = req.body;
        if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180) {
            return res.status(400).json({ success: false, error: "Choose a valid file name." });
        }
        if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > MAX_ATTACHMENT_BYTES) {
            return res.status(400).json({ success: false, error: "Files must be 5 MB or smaller." });
        }
        if (typeof contentType !== "string" || !ALLOWED_ATTACHMENT_TYPES.has(contentType.toLowerCase())) {
            return res.status(400).json({ success: false, error: "This file type is not supported in shared chats." });
        }
        if (typeof chatId !== "string" || !chatId || chatId.length > 180) {
            return res.status(400).json({ success: false, error: "Conversation ID is required." });
        }
        if (!await store.checkConversationMember(chatId, user.id)) {
            return res.status(403).json({ success: false, error: "You are not a member of this conversation." });
        }

        const result = await store.getUploadSignedUrl(fileName, contentType || "application/octet-stream", chatId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, error: publicErrorMessage(err, 500) });
    }
});

router.get("/attachment-url", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const { chatId, path } = req.query;
        if (!chatId || !path) {
            return res.status(400).json({ success: false, error: "chatId and path are required." });
        }

        const signedUrl = await store.getAttachmentSignedUrl({ chatId, path, userId: user.id });
        return res.json({ success: true, signedUrl });
    } catch (err) {
        return res.status(403).json({ success: false, error: publicErrorMessage(err, 403) });
    }
});

// ── Realtime SSE Stream ───────────────────────────
router.get("/stream", async (req, res) => {
    const ticket = typeof req.query.ticket === "string" ? req.query.ticket : "";
    const entry = streamTickets.get(ticket);
    streamTickets.delete(ticket);
    const user = entry && Date.now() < entry.expiresAt ? entry.user : null;
    if (!user) return res.status(401).end("Unauthorized");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    res.write(`: connected\n\n`);
    store.addSseClient(user.id, res);

    await store.pingOnline(user.id);

    const pingInterval = setInterval(() => {
        try { res.write(`: ping\n\n`); } catch (_) { clearInterval(pingInterval); }
    }, 25000);

    req.on("close", () => clearInterval(pingInterval));
});

module.exports = router;
