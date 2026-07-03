// ==========================================
// Conversation Memory
// ==========================================

const crypto = require("crypto");

const conversations = new Map();


// ==========================================
// Create Session
// ==========================================

function createSession() {

    const sessionId = crypto.randomUUID();

    conversations.set(sessionId, []);

    return sessionId;

}


// ==========================================
// Get Conversation
// ==========================================

function getConversation(sessionId) {

    if (!conversations.has(sessionId)) {

        conversations.set(sessionId, []);

    }

    return conversations.get(sessionId);

}


// ==========================================
// Add Message
// ==========================================

function addMessage(sessionId, role, content) {

    const history = getConversation(sessionId);

    history.push({
        role,
        content
    });

    // Keep only the latest 20 messages
    if (history.length > 20) {

        history.shift();

    }

}


// ==========================================
// Delete Session
// ==========================================

function deleteSession(sessionId) {

    conversations.delete(sessionId);

}


// ==========================================
// Get All Sessions
// ==========================================

function getSessions() {

    return [...conversations.keys()];

}


module.exports = {

    createSession,

    getConversation,

    addMessage,

    deleteSession,

    getSessions

};