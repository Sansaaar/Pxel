const db = require("../database/messages");
const express = require("express");
const router = express.Router();

const aiService = require("../services/aiService");
const memory = require("../memory/conversations");

router.post("/", async (req, res) => {

    try {

        const { conversationId, message, model } = req.body;

        // Validate request
        if (!conversationId || !message) {
            return res.status(400).json({
                error: "conversationId and message are required."
            });
        }

        // Save user message
        memory.addMessage(conversationId, "user", message);

await db.saveMessage(
    conversationId,
    "user",
    message
);

        // Generate AI reply
        const stream = await aiService.generate(
    conversationId,
    message,
    model
);

res.setHeader("Content-Type", "text/plain; charset=utf-8");
res.setHeader("Transfer-Encoding", "chunked");
let fullReply = "";

for await (const chunk of stream){

    const token =
        chunk.choices?.[0]?.delta?.content || "";

    fullReply += token;

    res.write(token);

}

memory.addMessage(
    conversationId,
    "assistant",
    fullReply
);

await db.saveMessage(
    conversationId,
    "assistant",
    fullReply
);

res.end();

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Internal Server Error"
        });

    }

});

module.exports = router;