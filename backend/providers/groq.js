// ==========================================
// Pixel Provider: Groq
// ==========================================

const Groq = require("groq-sdk");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

let client = null;

function getClient() {
    if (!client) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is not configured.");
        }
        client = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
    }
    return client;
}

async function* generate(model, history, { signal } = {}) {
    const groq = getClient();

    const messages = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        }
    ];

    for (const msg of history) {
        const role = msg.role === "assistant" ? "assistant" : "user";
        let textContent = msg.content || "";

        // Append text documents if present
        if (msg.attachments && Array.isArray(msg.attachments)) {
            for (const att of msg.attachments) {
                if (att.content) {
                    textContent = `[Attached Document: ${att.name || "File"}]\n\`\`\`\n${att.content}\n\`\`\`\n\n` + textContent;
                }
            }
        }

        messages.push({ role, content: textContent });
    }

    const stream = await groq.chat.completions.create({
        model,
        messages,
        temperature: 0.7,
        max_completion_tokens: 4096,
        stream: true
    }, { signal, timeout: 60_000 });

    let isThinking = false;

    for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) continue;

        // Support reasoning tokens if model outputs step-by-step reasoning
        if (delta.reasoning) {
            if (!isThinking) {
                yield "> *Thinking...*\n\n";
                isThinking = true;
            }
            yield delta.reasoning;
        }

        if (delta.content) {
            if (isThinking) {
                yield "\n\n---\n\n";
                isThinking = false;
            }
            yield delta.content;
        }
    }
}

module.exports = {
    generate
};
