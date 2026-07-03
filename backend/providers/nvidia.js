const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1"
});

async function generate(model, message){

    let messages;

    // Google Gemma models don't support system role
    if(model.startsWith("google/")){

        messages = [

            {
                role: "user",
                content: `You are Pixel, a premium AI assistant.
Be concise, helpful and friendly.

${message}`
            }

        ];

    }

    // All other models
    else{

        messages = [

            {
                role: "system",
                content: "You are Pixel, a premium AI assistant. Be concise, helpful and friendly."
            },

            {
                role: "user",
                content: message
            }

        ];

    }

    const completion = await client.chat.completions.create({

        model,

        messages,

        temperature: 0.7,

        max_tokens: 1024,

        stream: false

    });

    return completion.choices[0].message.content;

}

module.exports = {
    generate
};