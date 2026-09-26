// ==========================================
// Conversation Memory with Attachment Support
// ==========================================

const conversations = new Map();

function getConversation(conversationId) {
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
        attachments: Array.isArray(attachments) ? attachments : []
    });

    // Keep the latest 20 messages for context
    if (history.length > 20) {
        history.shift();
    }
}

function clearConversation(conversationId) {
    conversations.delete(conversationId);
}

module.exports = {
    getConversation,
    addMessage,
    clearConversation
};