const Groq = require("groq-sdk");

const client = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function generate(model, history){

    const completion = await client.chat.completions.create({

        model,

        messages: [

            {
                role: "system",
                content:
                    "You are Pixel, a premium AI assistant. Be concise, helpful and friendly."
            },

            ...history

        ],

        temperature: 0.7,

        max_completion_tokens: 1024

    });

    return completion.choices[0].message.content;

}

module.exports = {
    generate
};