// ==========================================
// Pixel AI 2.0: User Chat Store — Supabase Backend
// All operations are executed with server-side service role privileges
// enforcing membership and identity checks safely.
// ==========================================

const crypto = require("node:crypto");
const supabase = require("./supabase");

// SSE Subscriptions map: userId → Set<res>
const sseClients = new Map();

// ─────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────
function notifyUser(userId, payload) {
    const clientSet = sseClients.get(userId);
    if (!clientSet || clientSet.size === 0) return;
    const dataString = `data: ${JSON.stringify(payload)}\n\n`;
    clientSet.forEach(res => {
        try { res.write(dataString); } catch (_) {}
    });
}

async function notifyConversationMembers(chatId, payload) {
    const { data: members } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id")
        .eq("conversation_id", chatId);

    (members || []).forEach(m => notifyUser(m.user_id, payload));
}

function addSseClient(userId, res) {
    if (!sseClients.has(userId)) sseClients.set(userId, new Set());
    sseClients.get(userId).add(res);
    res.on("close", () => {
        const set = sseClients.get(userId);
        if (set) {
            set.delete(res);
            if (set.size === 0) sseClients.delete(userId);
        }
        // Mark user offline
        supabase.from("pixel_chat_users")
            .update({ is_online: false, last_seen: new Date().toISOString() })
            .eq("id", userId)
            .then(() => {});
    });
}

// ─────────────────────────────────────────
//  Membership Verification
// ─────────────────────────────────────────
async function checkConversationMember(chatId, userId) {
    if (userId === "system") return true;
    const { data, error } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id")
        .eq("conversation_id", chatId)
        .eq("user_id", userId)
        .maybeSingle();

    if (error) {
        console.error("[ChatStore] checkConversationMember error:", error.message);
        return false;
    }
    return !!data;
}

// ─────────────────────────────────────────
//  Users
// ─────────────────────────────────────────
async function registerOrUpdateUser(user) {
    if (!user || !user.id) return null;

    const avatar = user.avatar ||
        (user.display_name || user.email || "P").trim().charAt(0).toUpperCase();

    const record = {
        id: user.id,
        email: user.email || "pixel.user@pixel.local",
        display_name: user.display_name ||
            (user.email ? user.email.split("@")[0] : "Pixel User"),
        avatar,
        is_online: true,
        last_seen: new Date().toISOString()
    };

    const { data, error } = await supabase
        .from("pixel_chat_users")
        .upsert(record, { onConflict: "id" })
        .select()
        .single();

    if (error) {
        console.error("[ChatStore] registerOrUpdateUser:", error.message);
        return record;
    }
    return data;
}

async function searchUsers(query, currentUserId) {
    const q = (query || "").trim();
    let qb = supabase
        .from("pixel_chat_users")
        .select("id, email, display_name, avatar, is_online, last_seen")
        .neq("id", currentUserId || "__none__")
        .order("display_name");

    if (q) {
        qb = qb.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`);
    }

    const { data, error } = await qb.limit(30);
    if (error) {
        console.error("[ChatStore] searchUsers:", error.message);
        return [];
    }
    return data || [];
}

async function getUser(userId) {
    const { data } = await supabase
        .from("pixel_chat_users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
    return data || null;
}

// ─────────────────────────────────────────
//  Conversations
// ─────────────────────────────────────────
async function getOrCreateDirectConversation(user1, user2) {
    await registerOrUpdateUser(user1);
    await registerOrUpdateUser(user2);

    const sortedIds = [user1.id, user2.id].sort();
    const chatId = `direct_${sortedIds[0]}_${sortedIds[1]}`;

    // Try to find existing conversation
    const { data: existing } = await supabase
        .from("pixel_chat_conversations")
        .select("*")
        .eq("id", chatId)
        .maybeSingle();

    if (existing) {
        // Ensure membership rows exist for both
        await supabase.from("pixel_chat_room_members").upsert([
            { conversation_id: chatId, user_id: user1.id },
            { conversation_id: chatId, user_id: user2.id }
        ], { onConflict: "conversation_id,user_id" });
        return existing;
    }

    // Create conversation
    const { data: conv, error: convErr } = await supabase
        .from("pixel_chat_conversations")
        .insert({
            id: chatId,
            type: "direct",
            name: user2.display_name || "Direct Chat",
            owner_id: user1.id
        })
        .select()
        .single();

    if (convErr) throw new Error("Failed to create direct conversation: " + convErr.message);

    // Add both members
    await supabase.from("pixel_chat_room_members").insert([
        { conversation_id: chatId, user_id: user1.id },
        { conversation_id: chatId, user_id: user2.id }
    ]);

    return conv;
}

// ─────────────────────────────────────────
//  Rooms
// ─────────────────────────────────────────
function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "PIXEL-";
    for (let i = 0; i < 5; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function createRoom({ roomName, owner, topic }) {
    await registerOrUpdateUser(owner);

    let roomCode;
    let attempts = 0;
    do {
        roomCode = generateRoomCode();
        const { data: existing } = await supabase
            .from("pixel_chat_conversations")
            .select("id")
            .eq("code", roomCode)
            .maybeSingle();
        if (!existing) break;
        attempts++;
    } while (attempts < 10);

    const chatId = `room_${roomCode.toLowerCase()}`;

    const { data: room, error } = await supabase
        .from("pixel_chat_conversations")
        .insert({
            id: chatId,
            type: "room",
            code: roomCode,
            name: (roomName || "Pixel Room").trim(),
            topic: (topic || "Welcome to the room!").trim(),
            owner_id: owner.id
        })
        .select()
        .single();

    if (error) throw new Error("Failed to create room: " + error.message);

    await supabase.from("pixel_chat_room_members").insert({
        conversation_id: chatId,
        user_id: owner.id
    });

    notifyUser(owner.id, { type: "room_updated", roomCode, chatId });
    return room;
}

async function joinRoom({ roomCode, user }) {
    await registerOrUpdateUser(user);

    const cleanCode = (roomCode || "").trim().toUpperCase();
    const { data: room } = await supabase
        .from("pixel_chat_conversations")
        .select("*")
        .eq("type", "room")
        .eq("code", cleanCode)
        .maybeSingle();

    if (!room) throw new Error("Invalid room code. Please check and try again.");

    // Check if already a member
    const { data: existingMember } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id")
        .eq("conversation_id", room.id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (!existingMember) {
        await supabase.from("pixel_chat_room_members").insert({
            conversation_id: room.id,
            user_id: user.id
        });

        await sendMessage({
            chatId: room.id,
            sender: { id: "system", display_name: "System" },
            content: `${user.display_name || "A user"} joined the room.`
        });
    }

    return room;
}

async function updateRoomTopic({ roomCode, topic, userId }) {
    const cleanCode = (roomCode || "").trim().toUpperCase();
    const { data: room } = await supabase
        .from("pixel_chat_conversations")
        .select("*")
        .eq("type", "room")
        .eq("code", cleanCode)
        .maybeSingle();

    if (!room) throw new Error("Room not found.");
    if (room.owner_id !== userId) throw new Error("Only the room creator can set the topic.");

    const newTopic = (topic || "").trim();
    await supabase
        .from("pixel_chat_conversations")
        .update({ topic: newTopic })
        .eq("id", room.id);

    await sendMessage({
        chatId: room.id,
        sender: { id: "system", display_name: "System" },
        content: `Room topic updated to: "${newTopic}"`
    });

    await notifyConversationMembers(room.id, {
        type: "topic_updated",
        chatId: room.id,
        topic: newTopic
    });

    return { ...room, topic: newTopic };
}

async function deleteRoom({ roomCode, userId }) {
    const cleanCode = (roomCode || "").trim().toUpperCase();
    const { data: room } = await supabase
        .from("pixel_chat_conversations")
        .select("*")
        .eq("type", "room")
        .eq("code", cleanCode)
        .maybeSingle();

    if (!room) throw new Error("Room not found.");
    if (room.owner_id !== userId) throw new Error("Only the room creator can delete this room.");

    const { data: members } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id")
        .eq("conversation_id", room.id);

    await supabase.from("pixel_chat_conversations").delete().eq("id", room.id);

    (members || []).forEach(m =>
        notifyUser(m.user_id, { type: "room_deleted", roomCode, chatId: room.id })
    );

    return true;
}

async function getRoomParticipants(roomCode) {
    const cleanCode = (roomCode || "").trim().toUpperCase();
    const { data: room } = await supabase
        .from("pixel_chat_conversations")
        .select("id, owner_id")
        .eq("type", "room")
        .eq("code", cleanCode)
        .maybeSingle();

    if (!room) return [];

    const { data: members } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id, joined_at, pixel_chat_users!inner(id, display_name, email, avatar, is_online, last_seen)")
        .eq("conversation_id", room.id);

    return (members || []).map(m => ({
        id: m.user_id,
        display_name: m.pixel_chat_users?.display_name || "Pixel User",
        email: m.pixel_chat_users?.email || "",
        avatar: m.pixel_chat_users?.avatar || "P",
        is_owner: m.user_id === room.owner_id,
        online: m.pixel_chat_users?.is_online || false,
        last_seen: m.pixel_chat_users?.last_seen,
        joined_at: m.joined_at
    }));
}

// ─────────────────────────────────────────
//  Messages
// ─────────────────────────────────────────
async function sendMessage({ chatId, sender, content, attachments, replyTo }) {
    const { data: conversation } = await supabase
        .from("pixel_chat_conversations")
        .select("id")
        .eq("id", chatId)
        .maybeSingle();

    if (!conversation) throw new Error("Conversation or room not found.");

    if (sender.id !== "system") {
        await registerOrUpdateUser(sender);
    }

    const senderAvatar = sender.avatar ||
        (sender.display_name || "P").trim().charAt(0).toUpperCase();

    const msgRecord = {
        chat_id: chatId,
        sender_id: sender.id,
        sender_name: sender.display_name || "Pixel User",
        sender_avatar: senderAvatar,
        content: (content || "").trim(),
        attachments: Array.isArray(attachments) ? attachments : [],
        read_by: sender.id !== "system" ? [sender.id] : [],
        reply_to: replyTo || null
    };

    const { data: message, error: msgErr } = await supabase
        .from("pixel_chat_messages")
        .insert(msgRecord)
        .select()
        .single();

    if (msgErr) throw new Error("Failed to send message: " + msgErr.message);

    // Update conversation last_message
    const snippet = message.content || (message.attachments.length > 0 ? "📎 Attachment" : "");
    await supabase.from("pixel_chat_conversations").update({
        last_message: {
            sender_name: message.sender_name,
            content: snippet,
            timestamp: message.created_at
        },
        updated_at: message.created_at
    }).eq("id", chatId);

    const normalised = { ...message, timestamp: message.created_at };

    await notifyConversationMembers(chatId, {
        type: "new_message",
        chatId,
        message: normalised
    });

    return normalised;
}

async function getMessages(chatId, userId, limit = 100, before = null) {
    const isMember = await checkConversationMember(chatId, userId);
    if (!isMember) throw new Error("Access denied to this conversation.");

    let qb = supabase
        .from("pixel_chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true })
        .limit(limit);

    if (before) qb = qb.lt("created_at", before);

    const { data: messages, error } = await qb;
    if (error) throw new Error("Failed to fetch messages: " + error.message);

    const msgs = (messages || []).map(m => ({ ...m, timestamp: m.created_at }));

    // Mark as read
    msgs.forEach(m => {
        if (!m.read_by.includes(userId)) {
            supabase.from("pixel_chat_messages")
                .update({ read_by: [...m.read_by, userId] })
                .eq("id", m.id)
                .then(() => {});
            m.read_by.push(userId);
        }
    });

    return msgs;
}

async function toggleMessageReaction({ chatId, messageId, emoji, userId }) {
    const isMember = await checkConversationMember(chatId, userId);
    if (!isMember) throw new Error("Access denied.");

    const { data: msg, error } = await supabase
        .from("pixel_chat_messages")
        .select("reactions")
        .eq("id", messageId)
        .eq("chat_id", chatId)
        .single();

    if (error || !msg) throw new Error("Message not found.");

    const reactions = msg.reactions || {};
    if (!reactions[emoji]) reactions[emoji] = [];

    const idx = reactions[emoji].indexOf(userId);
    if (idx > -1) {
        reactions[emoji].splice(idx, 1);
        if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
        reactions[emoji].push(userId);
    }

    await supabase
        .from("pixel_chat_messages")
        .update({ reactions })
        .eq("id", messageId);

    await notifyConversationMembers(chatId, {
        type: "reaction_updated",
        chatId,
        messageId,
        reactions
    });

    return { reactions };
}

async function editMessage({ chatId, messageId, userId, newContent }) {
    const { data: msg } = await supabase
        .from("pixel_chat_messages")
        .select("sender_id, content")
        .eq("id", messageId)
        .eq("chat_id", chatId)
        .single();

    if (!msg) throw new Error("Message not found.");
    if (msg.sender_id !== userId) throw new Error("You can only edit your own messages.");

    const { data: updated } = await supabase
        .from("pixel_chat_messages")
        .update({ content: newContent.trim(), is_edited: true })
        .eq("id", messageId)
        .select()
        .single();

    const normalised = { ...updated, timestamp: updated.created_at };

    await notifyConversationMembers(chatId, {
        type: "message_edited",
        chatId,
        message: normalised
    });

    return normalised;
}

async function deleteMessage({ chatId, messageId, userId }) {
    const { data: msg } = await supabase
        .from("pixel_chat_messages")
        .select("sender_id")
        .eq("id", messageId)
        .eq("chat_id", chatId)
        .single();

    if (!msg) throw new Error("Message not found.");

    const { data: conv } = await supabase
        .from("pixel_chat_conversations")
        .select("owner_id")
        .eq("id", chatId)
        .single();

    if (msg.sender_id !== userId && conv?.owner_id !== userId) {
        throw new Error("You can only delete your own messages or room messages as owner.");
    }

    await supabase
        .from("pixel_chat_messages")
        .update({ is_deleted: true, content: "" })
        .eq("id", messageId);

    await notifyConversationMembers(chatId, {
        type: "message_deleted",
        chatId,
        messageId
    });

    return true;
}

async function clearChatHistory({ chatId, userId }) {
    const isMember = await checkConversationMember(chatId, userId);
    if (!isMember) throw new Error("Access denied.");

    await supabase.from("pixel_chat_messages").delete().eq("chat_id", chatId);
    await supabase.from("pixel_chat_conversations").update({ last_message: null }).eq("id", chatId);

    await notifyConversationMembers(chatId, { type: "history_cleared", chatId });
    return true;
}

async function getUserConversations(userId) {
    await registerOrUpdateUser({ id: userId });

    const { data: memberRows } = await supabase
        .from("pixel_chat_room_members")
        .select("conversation_id")
        .eq("user_id", userId);

    if (!memberRows || memberRows.length === 0) return [];

    const chatIds = memberRows.map(r => r.conversation_id);

    const { data: convs } = await supabase
        .from("pixel_chat_conversations")
        .select("*")
        .in("id", chatIds)
        .order("updated_at", { ascending: false });

    if (!convs || convs.length === 0) return [];

    const result = await Promise.all(convs.map(async c => {
        const { count: membersCount } = await supabase
            .from("pixel_chat_room_members")
            .select("*", { count: "exact", head: true })
            .eq("conversation_id", c.id);

        const { count: unreadCount } = await supabase
            .from("pixel_chat_messages")
            .select("*", { count: "exact", head: true })
            .eq("chat_id", c.id)
            .eq("is_deleted", false)
            .not("read_by", "cs", `["${userId}"]`)
            .neq("sender_id", userId);

        let displayName = c.name;
        let targetUser = null;

        if (c.type === "direct") {
            const parts = c.id.replace("direct_", "").split(/_(.*)/s);
            const otherId = parts[0] === userId ? parts[1] : parts[0];
            if (otherId) {
                const { data: otherUser } = await supabase
                    .from("pixel_chat_users")
                    .select("id, display_name, email, avatar, is_online")
                    .eq("id", otherId)
                    .maybeSingle();
                if (otherUser) {
                    targetUser = otherUser;
                    displayName = otherUser.display_name;
                }
            }
        }

        return {
            id: c.id,
            type: c.type,
            code: c.code,
            name: displayName,
            topic: c.topic,
            owner_id: c.owner_id,
            is_owner: c.owner_id === userId,
            members_count: membersCount || 1,
            target_user: targetUser,
            last_message: c.last_message,
            unread_count: unreadCount || 0,
            updated_at: c.updated_at
        };
    }));

    return result;
}

// ─────────────────────────────────────────
//  Typing Indicators
// ─────────────────────────────────────────
async function setTyping({ chatId, userId, userName, isTyping }) {
    if (isTyping) {
        await supabase.from("pixel_chat_typing").upsert({
            chat_id: chatId,
            user_id: userId,
            user_name: userName,
            started_at: new Date().toISOString()
        }, { onConflict: "chat_id,user_id" });
    } else {
        await supabase.from("pixel_chat_typing")
            .delete()
            .eq("chat_id", chatId)
            .eq("user_id", userId);
    }

    const { data: members } = await supabase
        .from("pixel_chat_room_members")
        .select("user_id")
        .eq("conversation_id", chatId);

    (members || [])
        .filter(m => m.user_id !== userId)
        .forEach(m => notifyUser(m.user_id, {
            type: "typing",
            chatId,
            userId,
            userName,
            isTyping
        }));
}

// ─────────────────────────────────────────
//  Pin / Unpin Messages
// ─────────────────────────────────────────
async function togglePinMessage({ chatId, messageId, userId }) {
    const { data: msg } = await supabase
        .from("pixel_chat_messages")
        .select("pinned, sender_id")
        .eq("id", messageId)
        .eq("chat_id", chatId)
        .single();

    if (!msg) throw new Error("Message not found.");

    const { data: conv } = await supabase
        .from("pixel_chat_conversations")
        .select("owner_id")
        .eq("id", chatId)
        .single();

    if (conv?.owner_id !== userId) throw new Error("Only the room owner can pin messages.");

    const newPinned = !msg.pinned;
    await supabase.from("pixel_chat_messages").update({ pinned: newPinned }).eq("id", messageId);

    await notifyConversationMembers(chatId, {
        type: "message_pinned",
        chatId,
        messageId,
        pinned: newPinned
    });

    return { pinned: newPinned };
}

async function getPinnedMessages(chatId, userId) {
    const isMember = await checkConversationMember(chatId, userId);
    if (!isMember) throw new Error("Access denied.");

    const { data, error } = await supabase
        .from("pixel_chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .eq("pinned", true)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

    if (error) return [];
    return (data || []).map(m => ({ ...m, timestamp: m.created_at }));
}

// ─────────────────────────────────────────
//  File Upload URL via Supabase Storage
// ─────────────────────────────────────────
async function getUploadSignedUrl(fileName, contentType, chatId) {
    const safeChatId = String(chatId).replace(/[^a-zA-Z0-9_-]/g, "");
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `chat/${safeChatId}/${crypto.randomUUID()}_${safeName}`;

    const { data, error } = await supabase
        .storage
        .from("pixel-chat-attachments")
        .createSignedUploadUrl(path);

    if (error) throw new Error("Failed to generate upload URL: " + error.message);

    return {
        signedUrl: data.signedUrl,
        token: data.token,
        path
    };
}

function attachmentPathFromUrl(url) {
    if (typeof url !== "string") return null;
    const marker = "/storage/v1/object/public/pixel-chat-attachments/";
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) return null;
    try {
        return decodeURIComponent(url.slice(markerIndex + marker.length).split(/[?#]/, 1)[0]);
    } catch (_) {
        return null;
    }
}

async function getAttachmentSignedUrl({ chatId, path, userId }) {
    const safeChatId = String(chatId).replace(/[^a-zA-Z0-9_-]/g, "");
    if (typeof path !== "string" || !path.startsWith(`chat/${safeChatId}/`)) {
        throw new Error("Invalid attachment path.");
    }

    const isMember = await checkConversationMember(chatId, userId);
    if (!isMember) throw new Error("Access denied to this conversation.");

    const { data: messages, error: messagesError } = await supabase
        .from("pixel_chat_messages")
        .select("attachments")
        .eq("chat_id", chatId)
        .eq("is_deleted", false);

    if (messagesError) throw new Error("Unable to verify attachment access.");

    const belongsToConversation = (messages || []).some(message =>
        (Array.isArray(message.attachments) ? message.attachments : []).some(attachment =>
            attachment?.path === path || attachmentPathFromUrl(attachment?.url) === path
        )
    );
    if (!belongsToConversation) throw new Error("Attachment not found in this conversation.");

    const { data, error } = await supabase
        .storage
        .from("pixel-chat-attachments")
        .createSignedUrl(path, 60 * 60);

    if (error) throw new Error("Unable to load this attachment.");
    return data.signedUrl;
}

// ─────────────────────────────────────────
//  Online Presence Ping
// ─────────────────────────────────────────
async function pingOnline(userId) {
    await supabase.from("pixel_chat_users")
        .update({ is_online: true, last_seen: new Date().toISOString() })
        .eq("id", userId);
}

// ─────────────────────────────────────────
//  Exports
// ─────────────────────────────────────────
module.exports = {
    checkConversationMember,
    registerOrUpdateUser,
    searchUsers,
    getUser,
    pingOnline,
    getOrCreateDirectConversation,
    getUserConversations,
    createRoom,
    joinRoom,
    updateRoomTopic,
    deleteRoom,
    getRoomParticipants,
    sendMessage,
    getMessages,
    toggleMessageReaction,
    editMessage,
    deleteMessage,
    clearChatHistory,
    setTyping,
    togglePinMessage,
    getPinnedMessages,
    getUploadSignedUrl,
    getAttachmentSignedUrl,
    addSseClient
};
