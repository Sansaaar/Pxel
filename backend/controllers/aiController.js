const axios = require("axios");

async function generateResponse(message) {

    try {

        const response = await axios.post(

            "https://integrate.api.nvidia.com/v1/chat/completions",

            {
                model: "meta/llama-3.3-70b-instruct",

                messages: [

    {
        role: "user",
        content:
`You are Pixel, a premium AI assistant.

${message}`
    }

],

                temperature: 0.7,
                max_tokens: 1024
            },

            {
                headers: {
                    Authorization: `Bearer ${process.env.NVIDIA_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }

        );

        return response.data.choices[0].message.content;

    } catch (err) {

        console.error(err.response?.data || err);

        throw err;

    }

}

module.exports = generateResponse;