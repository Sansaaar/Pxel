// ==========================================
// Pixel AI Models Configuration
// ==========================================

const MODELS = {
    "auto": {
        id: "auto",
        display: "Auto",
        provider: "auto",
        badge: "Smart",
        description: "Automatically selects the fastest and best model for your request",
        capabilities: ["Auto-routing", "Adaptive", "High availability"],
        available: true
    },

    "gemini-3.5-flash-lite": {
        id: "gemini-3.5-flash-lite",
        display: "Gemini 3.5 Flash",
        provider: "gemini",
        badge: "Google",
        description: "Google's ultra-fast, intelligent assistant for everyday tasks",
        capabilities: ["Ultra-fast", "General purpose", "Multilingual"],
        available: true
    },

    "meta/llama-3.2-11b-vision-instruct": {
        id: "meta/llama-3.2-11b-vision-instruct",
        display: "Llama 3.2 11B",
        provider: "nvidia",
        badge: "Meta",
        description: "Meta's flagship instruction-tuned open weights model",
        capabilities: ["Instruction", "Writing", "Reasoning"],
        available: true
    },

    "qwen/qwen3.8-27b": {
        id: "qwen/qwen3.8-27b",
        display: "Qwen 3.8 27B",
        provider: "groq",
        badge: "Groq LPU",
        description: "Alibaba's advanced multilingual & coding powerhouse on Groq LPUs",
        capabilities: ["Coding", "Instant speed", "Multilingual"],
        available: true
    },

    "openai/gpt-oss-20b": {
        id: "openai/gpt-oss-20b",
        display: "GPT OSS 20B (Reasoning)",
        provider: "groq",
        badge: "Reasoning",
        description: "Deep reasoning, step-by-step logic, and programming tasks",
        capabilities: ["Deep reasoning", "Code analysis", "Logic"],
        available: true
    },

    "gemma-4-26b-a4b-it": {
        id: "gemma-4-26b-a4b-it",
        display: "Gemma 4 26B",
        provider: "gemini",
        badge: "Google",
        description: "Google's cutting-edge open research architecture",
        capabilities: ["Creative", "Concise", "Research"],
        available: true
    },

    "nex-agi/nex-n2.5-mini:free": {
        id: "nex-agi/nex-n2.5-mini:free",
        display: "Nex N2.5 Mini",
        provider: "openrouter",
        badge: "OpenRouter",
        description: "Fast conversational assistant via OpenRouter",
        capabilities: ["Conversational", "Creative"],
        available: true
    }
};

// Backwards-compatible aliases
const ALIASES = {
    "gemini": "gemini-3.5-flash-lite",
    "gemini-3.5-flash": "gemini-3.5-flash-lite",
    "gemini-2.5-flash": "gemini-3.5-flash-lite",
    "llama": "meta/llama-3.2-11b-vision-instruct",
    "llama-3.3-70b-versatile": "meta/llama-3.2-11b-vision-instruct",
    "meta-llama/llama-3.3-70b-instruct:free": "meta/llama-3.2-11b-vision-instruct",
    "qwen": "qwen/qwen3.8-27b",
    "qwen/qwen3-32b": "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b": "qwen/qwen3.8-27b",
    "groq": "qwen/qwen3.8-27b",
    "groq/compound": "openai/gpt-oss-20b",
    "deepseek": "openai/gpt-oss-20b",
    "deepseek/deepseek-r1:free": "openai/gpt-oss-20b",
    "gemma": "gemma-4-26b-a4b-it",
    "google/gemma-4-26b-a4b-it:free": "gemma-4-26b-a4b-it"
};

function resolveModel(modelKey) {
    if (!modelKey || modelKey === "auto") {
        return "auto";
    }
    if (MODELS[modelKey]) {
        return modelKey;
    }
    if (ALIASES[modelKey]) {
        return ALIASES[modelKey];
    }
    return null;
}

function isProviderConfigured(provider, env = process.env) {
    const keys = {
        gemini: "GEMINI_API_KEY",
        groq: "GROQ_API_KEY",
        nvidia: "NVIDIA_API_KEY",
        openrouter: "OPENROUTER_API_KEY"
    };
    return provider === "auto"
        ? Object.values(keys).some(key => Boolean(env[key]))
        : Boolean(keys[provider] && env[keys[provider]]);
}

function getModelAvailability(env = process.env) {
    return Object.fromEntries(Object.entries(MODELS).map(([id, model]) => [
        id,
        model.provider === "auto"
            ? Object.values(MODELS).some(candidate =>
                candidate.provider !== "auto" && isProviderConfigured(candidate.provider, env)
            )
            : isProviderConfigured(model.provider, env)
    ]));
}

module.exports = {
    MODELS,
    ALIASES,
    resolveModel,
    isProviderConfigured,
    getModelAvailability
};
