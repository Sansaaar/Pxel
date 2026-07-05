// ==========================================
// Conversation Memory
// ==========================================


const conversations = new Map();

function getConversation(conversationId) {

    if (!conversations.has(conversationId)) {

        conversations.set(conversationId, []);

    }

    return conversations.get(conversationId);

}

function addMessage(conversationId, role, content) {

    const history = getConversation(conversationId);

    history.push({
        role,
        content
    });

    // Keep only the latest 20 messages
    if (history.length > 20) {

        history.shift();

    }

}

module.exports = {
    getConversation,
    addMessage
};