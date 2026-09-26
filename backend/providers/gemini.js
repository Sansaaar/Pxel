// ==========================================
// Pixel Provider: Google Gemini (Multimodal + Text)
// ==========================================

const { GoogleGenAI } = require("@google/genai");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

let client = null;

function getClient() {
    if (!client) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not configured.");
        }
        client = new GoogleGenAI({
            apiKey: process.env.GEMINI_API_KEY
        });
    }
    return client;
}

async function* generate(model, history, { signal } = {}) {
    const ai = getClient();

    // Map history to Gemini format (role: user | model)
    const contents = [];
    for (const msg of history) {
        const role = msg.role === "assistant" ? "model" : "user";
        const parts = [];

        // Handle attached files / images
        if (msg.attachments && Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
                if (att.type && att.type.startsWith("image/") && att.data) {
                    const base64Data = att.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
                    if (base64Data) {
                        parts.push({
                            inlineData: {
                                mimeType: att.type,
                                data: base64Data
                            }
                        });
                    }
                } else if (att.content) {
                    parts.push({
                        text: `\n\n[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n`
                    });
                }
            }
        }

        if (msg.content && msg.content.trim()) {
            parts.push({ text: msg.content });
        }

        if (parts.length > 0) {
            contents.push({ role, parts });
        }
    }

    if (contents.length === 0) {
        throw new Error("No message content to generate.");
    }

    const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
            systemInstruction: SYSTEM_PROMPT,
            temperature: 0.7,
            abortSignal: signal,
            httpOptions: { timeout: 60_000 }
        }
    });

    for await (const chunk of stream) {
        const text = chunk.text;
        if (text) {
            yield text;
        }
    }
}

module.exports = {
    generate
};
