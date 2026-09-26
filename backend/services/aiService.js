// ==========================================
// Pixel AI Service - Provider Abstraction Layer
// ==========================================

const memory = require("../memory/conversations");
const { MODELS, resolveModel, isProviderConfigured } = require("../config/models");

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
    const candidates = hasImages ? VISION_MODELS : FALLBACK_CHAIN;
    return candidates.find(key => isProviderConfigured(MODELS[key]?.provider)) || null;
}

async function* generateWithFallback(targetModel, history, hasImages = false, onModelSelected = () => {}, signal) {
    const explicitlySelected = targetModel !== "auto";
    const fallbackCandidates = (hasImages ? VISION_MODELS : FALLBACK_CHAIN).filter((modelKey, index, all) =>
        all.indexOf(modelKey) === index && isProviderConfigured(MODELS[modelKey]?.provider)
    );
    const preferredModel = !explicitlySelected ? selectBestModel(hasImages) : null;
    const candidateModels = explicitlySelected
        ? [targetModel]
        : [preferredModel, ...fallbackCandidates].filter((modelKey, index, all) => modelKey && all.indexOf(modelKey) === index);

    if (explicitlySelected && hasImages && !VISION_MODELS.includes(targetModel)) {
        const error = new Error("The selected model does not support image attachments.");
        error.code = "MODEL_UNSUPPORTED_ATTACHMENT";
        throw error;
    }

    if (!candidateModels.length) {
        const error = new Error("No configured model is available for this request.");
        error.code = "MODEL_UNAVAILABLE";
        throw error;
    }

    let lastError = null;

    for (const modelKey of candidateModels) {
        const modelInfo = MODELS[modelKey];

        if (
            !modelInfo ||
            !modelInfo.provider ||
            !providers[modelInfo.provider] ||
            !isProviderConfigured(modelInfo.provider)
        ) {
            continue;
        }

        let hasYielded = false;
        try {
            onModelSelected(modelKey, candidateModels[0] !== modelKey);
            console.log(`[Pixel AI] Attempting ${modelInfo.provider}:${modelKey}...`);

            const provider = providers[modelInfo.provider];

            const stream = provider.generate(modelKey, history, { signal });

            for await (const token of stream) {
                hasYielded = true;
                yield token;
            }

            if (hasYielded) {
                return;
            }

        } catch (err) {
            console.warn(`[Pixel AI] Model ${modelKey} failed:`, err.message);

            lastError = err;
            if (explicitlySelected || hasYielded || signal?.aborted) break;
        }
    }

    if (lastError) throw lastError;
    const error = new Error("All AI models are currently unavailable.");
    error.code = "MODEL_UNAVAILABLE";
    throw error;
}

async function generate(conversationId, message, selectedModel, onModelSelected, signal) {

    const history = memory.getConversation(conversationId);

    // Check if any recent user message in history has images
    const lastMsg = history[history.length - 1];

    const hasImages = lastMsg?.attachments?.some(
        a => a.type && a.type.startsWith("image/")
    );

    // ==========================================
    // Build the final AI message history
    // ==========================================

    const aiHistory = history;

    // Resolve model name or alias
    const resolvedKey = resolveModel(selectedModel);

    if (!resolvedKey) {
        const error = new Error("The requested model is not supported.");
        error.code = "INVALID_MODEL";
        throw error;
    }

    return generateWithFallback(
        resolvedKey,
        aiHistory,
        hasImages,
        onModelSelected,
        signal
    );
}

module.exports = {
    generate,
    selectBestModel
};
