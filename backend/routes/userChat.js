// ==========================================
// Pixel AI: Direct User Chat & Chat Room Router
// Provides secure endpoints with JWT Bearer Token verification
// and strict conversation membership checks.
// ==========================================

const express = require("express");
const router = express.Router();
const supabase = require("../database/supabase");
const store = require("../database/userChatStore");

// ── Authentication & Profile Synchronization ─────
async function getAuthenticatedUser(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let token = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    }

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

    // Fallback: for guest mode or development header
    const guestId = req.headers["x-pixel-user-id"] || req.query.userId || req.body?.userId;
    if (guestId) {
        const guestName = req.headers["x-pixel-user-name"] || "Pixel User";
        return await store.registerOrUpdateUser({
            id: guestId,
            email: `${guestId}@pixel.local`,
            display_name: guestName,
            avatar: guestName.trim().charAt(0).toUpperCase()
        });
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

// ── Presence Ping ─────────────────────────────────
router.post("/ping", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Unauthorized." });
        await store.pingOnline(user.id);
        return res.json({ success: true });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
    }
});

// ── Room Participants ─────────────────────────────
router.get("/rooms/participants", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const { roomCode } = req.query;
        if (!roomCode) return res.status(400).json({ success: false, error: "roomCode parameter required." });

        const participants = await store.getRoomParticipants(roomCode);
        return res.json({ success: true, participants });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(403).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(400).json({ success: false, error: err.message });
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
        return res.status(500).json({ success: false, error: err.message });
    }
});

// ── File Upload Signed URL ────────────────────────
router.post("/upload-url", async (req, res) => {
    try {
        const user = await getAuthenticatedUser(req);
        if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

        const { fileName, contentType, chatId } = req.body;
        if (!fileName) return res.status(400).json({ success: false, error: "fileName is required." });
        if (!chatId) return res.status(400).json({ success: false, error: "chatId is required." });
        if (!await store.checkConversationMember(chatId, user.id)) {
            return res.status(403).json({ success: false, error: "You are not a member of this conversation." });
        }

        const result = await store.getUploadSignedUrl(fileName, contentType || "application/octet-stream", chatId);
        return res.json({ success: true, ...result });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
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
        return res.status(403).json({ success: false, error: err.message });
    }
});

// ── Realtime SSE Stream ───────────────────────────
router.get("/stream", async (req, res) => {
    const user = await getAuthenticatedUser(req);
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
