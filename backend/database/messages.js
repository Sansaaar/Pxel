const supabase = require("./supabase");

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function saveMessage(conversationId, role, content) {
    if (!conversationId || !UUID_REGEX.test(conversationId)) {
        // Not a UUID (e.g. guest or local session ID); skip remote DB save
        return;
    }

    try {
        const { error } = await supabase
            .from("messages")
            .insert({
                conversation_id: conversationId,
                role,
                content
            });

        if (error) {
            console.warn("[Database] Save message warning:", error.message);
        }
    } catch (err) {
        console.warn("[Database] Save message failed:", err.message);
    }
}

module.exports = {
    saveMessage
};