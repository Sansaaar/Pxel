const supabase = require("./supabase");

async function saveMessage(conversationId, role, content) {

    const { error } = await supabase
        .from("messages")
        .insert({

            conversation_id: conversationId,
            role,
            content

        });

    if (error) {

        console.error("Save message:", error);

    }

}

module.exports = {
    saveMessage
};