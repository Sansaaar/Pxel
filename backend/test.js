require("dotenv").config();

const OpenAI = require("openai");

const client = new OpenAI({
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1"
});

async function test() {

    try {

        console.log("API loaded:", !!process.env.NVIDIA_API_KEY);
        console.log("Sending request...");

        const completion = await client.chat.completions.create({

            model: "google/gemma-2-2b-it",

            messages: [
                {
                    role: "user",
                    content: "Say hello in one sentence."
                }
            ],

            stream: false

        });

        console.log("SUCCESS!");
        console.log(completion.choices[0].message.content);

    } catch (err) {

        console.error("ERROR:");
        console.error(err);

    }

}

test();