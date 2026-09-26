// ==========================================
// Pixel Provider: NVIDIA NIM (Vision + Text)
// ==========================================

const OpenAI = require("openai");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

let client = null;

function getClient() {
    if (!client) {
        if (!process.env.NVIDIA_API_KEY) {
            throw new Error("NVIDIA_API_KEY is not configured.");
        }
        client = new OpenAI({
            apiKey: process.env.NVIDIA_API_KEY,
            baseURL: "https://integrate.api.nvidia.com/v1"
        });
    }
    return client;
}

async function* generate(model, history) {
    const nvidia = getClient();

    const messages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        }
    ];

    for (const msg of history) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        const hasImages = msg.attachments && msg.attachments.some(a => a.type && a.type.startsWith("image/") && a.data);
        const hasDocs = msg.attachments && msg.attachments.some(a => a.content);

        if (role === "user" && (hasImages || hasDocs)) {
            const contentParts = [];

            // Add text documents first
            if (hasDocs) {
                for (const att of msg.attachments) {
                    if (att.content) {
                        contentParts.push({
                            type: "text",
                            text: `\n\n[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n`
                        });
                    }
                }
            }

            // Add images
            if (hasImages) {
                for (const att of msg.attachments) {
                    if (att.type && att.type.startsWith("image/") && att.data) {
                        const dataUrl = att.data.startsWith("data:") ? att.data : `data:${att.type};base64,${att.data}`;
                        contentParts.push({
                            type: "image_url",
                            image_url: { url: dataUrl }
                        });
                    }
                }
            }

            if (msg.content) {
                contentParts.push({
                    type: "text",
                    text: msg.content
                });
            }

            messages.push({ role, content: contentParts });
        } else {
            let fullText = msg.content || "";
            if (msg.attachments && msg.attachments.length > 0) {
                for (const att of msg.attachments) {
                    if (att.content) {
                        fullText = `[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n\n` + fullText;
                    }
                }
            }
            messages.push({ role, content: fullText });
        }
    }

    const stream = await nvidia.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true
    });

    for await (const chunk of stream) {
        const token = chunk.choices?.[0]?.delta?.content;
        if (token) {
            yield token;
        }
    }
}

module.exports = {
    generate
};