// ==========================================
// Conversation Memory with Attachment Support
// ==========================================

const conversations = new Map();
const lastAccessed = new Map();
const MAX_CONVERSATIONS = 200;
const MEMORY_TTL_MS = 60 * 60 * 1000;

function touch(conversationId) {
    const now = Date.now();
    lastAccessed.set(conversationId, now);
    for (const [id, timestamp] of lastAccessed) {
        if (now - timestamp > MEMORY_TTL_MS) {
            conversations.delete(id);
            lastAccessed.delete(id);
        }
    }
    if (conversations.size > MAX_CONVERSATIONS) {
        const oldest = [...lastAccessed.entries()].sort((a, b) => a[1] - b[1]);
        for (const [id] of oldest.slice(0, conversations.size - MAX_CONVERSATIONS)) {
            conversations.delete(id);
            lastAccessed.delete(id);
        }
    }
}

function getConversation(conversationId) {
    touch(conversationId);
    if (!conversations.has(conversationId)) {
        conversations.set(conversationId, []);
    }
    return conversations.get(conversationId);
}

function addMessage(conversationId, role, content, attachments = []) {
    const history = getConversation(conversationId);

    history.push({
        role,
        content: content || "",
        attachments: Array.isArray(attachments) ? attachments : [],
        created_at: new Date().toISOString()
    });

    // Keep the latest 20 messages for context
    if (history.length > 20) {
        history.shift();
    }
}

function replaceConversation(conversationId, messages = []) {
    touch(conversationId);
    conversations.set(conversationId, messages.slice(-20).map(message => ({
        role: message.role,
        content: message.content || "",
        attachments: Array.isArray(message.attachments) ? message.attachments : [],
        created_at: message.created_at || new Date().toISOString()
    })));
}

function clearConversation(conversationId) {
    conversations.delete(conversationId);
    lastAccessed.delete(conversationId);
}

module.exports = {
    getConversation,
    addMessage,
    replaceConversation,
    clearConversation
};
