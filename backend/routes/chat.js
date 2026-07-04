const express = require("express");
const router = express.Router();

const aiService = require("../services/aiService");
const memory = require("../memory/conversations");

router.post("/", async (req, res) => {

    try {

        const { sessionId, message, model } = req.body;

        // Validate request
        if (!sessionId || !message) {
            return res.status(400).json({
                error: "sessionId and message are required."
            });
        }

        // Save user message
        memory.addMessage(sessionId, "user", message);

        // Generate AI reply
        const stream = await aiService.generate(
    sessionId,
    message,
    model
);

res.setHeader("Content-Type", "text/plain; charset=utf-8");
res.setHeader("Transfer-Encoding", "chunked");

for await (const chunk of stream){

    const token =
        chunk.choices?.[0]?.delta?.content || "";

    res.write(token);

}

res.end();

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: "Internal Server Error"
        });

    }

});

module.exports = router;
