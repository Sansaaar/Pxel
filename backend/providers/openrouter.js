// ==========================================
// Pixel Provider: OpenRouter
// ==========================================

const OpenAI = require("openai");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

let client = null;

function getClient() {
    if (!client) {
        if (!process.env.OPENROUTER_API_KEY) {
            throw new Error("OPENROUTER_API_KEY is not configured.");
        }
        client = new OpenAI({
            apiKey: process.env.OPENROUTER_API_KEY,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "https://pixel.ai",
                "X-Title": "Pixel AI"
            }
        });
    }
    return client;
}

async function* generate(model, history, { signal } = {}) {
    const openrouter = getClient();

    const messages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        }
    ];

    for (const msg of history) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        const hasImages = msg.attachments && msg.attachments.some(a => a.type && a.type.startsWith("image/") && a.data);

        if (role === "user" && hasImages) {
            const contentParts = [];
            for (const att of msg.attachments) {
                if (att.type && att.type.startsWith("image/") && att.data) {
                    const dataUrl = att.data.startsWith("data:") ? att.data : `data:${att.type};base64,${att.data}`;
                    contentParts.push({
                        type: "image_url",
                        image_url: { url: dataUrl }
                    });
                } else if (att.content) {
                    contentParts.push({
                        type: "text",
                        text: `\n\n[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n`
                    });
                }
            }
            if (msg.content) {
                contentParts.push({ type: "text", text: msg.content });
            }
            messages.push({ role, content: contentParts });
        } else {
            let textContent = msg.content || "";
            if (msg.attachments && Array.isArray(msg.attachments)) {
                for (const att of msg.attachments) {
                    if (att.content) {
                        textContent = `[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n\n` + textContent;
                    }
                }
            }
            messages.push({ role, content: textContent });
        }
    }

    const stream = await openrouter.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true
    }, { signal, timeout: 60_000 });

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
