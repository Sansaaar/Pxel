const Groq = require("groq-sdk");

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function generate(model, message) {

    const completion = await client.chat.completions.create({

        model,

        messages: [

            {
                role: "system",
                content: "You are Pixel, a premium AI assistant. Be concise, helpful and friendly."
            },

            {
                role: "user",
                content: message
            }

        ],

        temperature: 0.7,

        max_completion_tokens: 1024,

        stream: true

    });

    return completion;

}

module.exports = {
    generate
};
