// ==========================================
// Pixel AI Service - Provider Abstraction Layer
// ==========================================

const memory = require("../memory/conversations");
const { MODELS, resolveModel } = require("../config/models");
const { SYSTEM_PROMPT } = require("../prompts/systemPrompt");

const providers = {
    groq: require("../providers/groq"),
    gemini: require("../providers/gemini"),
    nvidia: require("../providers/nvidia"),
    openrouter: require("../providers/openrouter")
};

// Resilient fallback order for Auto and Provider outages
const FALLBACK_CHAIN = [
    "gemini-3.5-flash-lite",
    "meta/llama-3.2-11b-vision-instruct",
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "gemma-4-26b-a4b-it",
    "nex-agi/nex-n2.5-mini:free"
];

// Models verified to support multimodal / vision inputs
const VISION_MODELS = [
    "gemini-3.5-flash-lite",
    "meta/llama-3.2-11b-vision-instruct"
];

function selectBestModel(hasImages = false) {
    if (hasImages) {
        return "gemini-3.5-flash-lite";
    }

    return "gemini-3.5-flash-lite";
}

async function* generateWithFallback(
    targetModel,
    history,
    hasImages = false
) {
    const candidateModels = [];

    if (targetModel && targetModel !== "auto") {
        candidateModels.push(targetModel);
    }

    // If request contains images, prioritize vision models first
    if (hasImages) {
        for (const vm of VISION_MODELS) {
            if (!candidateModels.includes(vm)) {
                candidateModels.push(vm);
            }
        }
    }

    // Add fallbacks
    for (const fb of FALLBACK_CHAIN) {
        if (!candidateModels.includes(fb)) {
            candidateModels.push(fb);
        }
    }

    let lastError = null;

    for (const modelKey of candidateModels) {
        const modelInfo = MODELS[modelKey];

        if (
            !modelInfo ||
            !modelInfo.provider ||
            !providers[modelInfo.provider]
        ) {
            continue;
        }

        try {
            console.log(
                `[Pixel AI] Attempting ${modelInfo.provider}:${modelKey}...`
            );

            const provider = providers[modelInfo.provider];

            const stream = provider.generate(modelKey, history);

            let hasYielded = false;

            for await (const token of stream) {
                hasYielded = true;
                yield token;
            }

            if (hasYielded) {
                return;
            }

        } catch (err) {
            console.warn(
                `[Pixel AI] Model ${modelKey} failed (${err.message}). Trying fallback...`
            );

            lastError = err;
        }
    }

    throw lastError || new Error(
        "All AI models are currently unavailable. Please check your API keys."
    );
}

async function generate(conversationId, message, selectedModel) {

    const history = memory.getConversation(conversationId);

    // Check if any recent user message in history has images
    const lastMsg = history[history.length - 1];

    const hasImages = lastMsg?.attachments?.some(
        a => a.type && a.type.startsWith("image/")
    );

    // ==========================================
    // Build the final AI message history
    // ==========================================

    const aiHistory = [
        {
            role: "system",
            content: SYSTEM_PROMPT
        },
        ...history
    ];

    // Resolve model name or alias
    let resolvedKey = resolveModel(selectedModel);

    if (resolvedKey === "auto") {
        resolvedKey = selectBestModel(hasImages);
    }

    return generateWithFallback(
        resolvedKey,
        aiHistory,
        hasImages
    );
}

module.exports = {
    generate,
    selectBestModel
};