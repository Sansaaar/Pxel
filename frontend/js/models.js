// ==========================================
// Pixel AI: Model Registry & Selector
// ==========================================

(function() {
    const DEFAULT_MODELS = [
        {
            id: "auto",
            name: "Auto",
            provider: "auto",
            badge: "Smart",
            description: "Automatically routes to the fastest and best model",
            capabilities: ["Auto-routing", "Fast", "Resilient"],
            icon: "✨"
        },
        {
            id: "gemini-3.5-flash-lite",
            name: "Gemini 3.5 Flash",
            provider: "gemini",
            badge: "Google",
            description: "Ultra-fast, intelligent assistant for everyday tasks",
            capabilities: ["Ultra-fast", "General", "Multilingual"],
            icon: "⚡"
        },
        {
            id: "meta/llama-3.2-11b-vision-instruct",
            name: "Llama 3.2 11B",
            provider: "nvidia",
            badge: "Meta",
            description: "Meta's flagship instruction-tuned open weights model",
            capabilities: ["Instruction", "Writing", "Reasoning"],
            icon: "🦙"
        },
        {
            id: "qwen/qwen3.8-27b",
            name: "Qwen 3.8 27B",
            provider: "groq",
            badge: "Groq LPU",
            description: "High-speed coding, math, and multilingual reasoning on Groq LPUs",
            capabilities: ["Coding", "Instant", "Multilingual"],
            icon: "💻"
        },
        {
            id: "openai/gpt-oss-20b",
            name: "GPT OSS 20B",
            provider: "groq",
            badge: "Reasoning",
            description: "Deep reasoning, step-by-step logic, and programming tasks",
            capabilities: ["Deep reasoning", "Code", "Logic"],
            icon: "🧠"
        },
        {
            id: "gemma-4-26b-a4b-it",
            name: "Gemma 4 26B",
            provider: "gemini",
            badge: "Google",
            description: "Google's cutting-edge open research architecture",
            capabilities: ["Creative", "Concise", "Research"],
            icon: "💎"
        },
        {
            id: "nex-agi/nex-n2.5-mini:free",
            name: "Nex N2.5 Mini",
            provider: "openrouter",
            badge: "OpenRouter",
            description: "Fast conversational assistant via OpenRouter",
            capabilities: ["Chat", "Lightweight"],
            icon: "💬"
        }
    ];

    let availableModels = [{ ...DEFAULT_MODELS[0], available: true }];
    let currentModel = DEFAULT_MODELS[0];
    let savedModelId = null;

    // Restore saved model preference
    try {
        const saved = localStorage.getItem("pixel-model");
        if (saved) {
            const parsed = JSON.parse(saved);
            savedModelId = parsed.id;
        }
    } catch (e) {
        console.warn("[Pixel Models] Could not parse saved model:", e);
    }

    function getModelIcon(provider) {
        switch (provider) {
            case "auto": return "✨";
            case "gemini": return "⚡";
            case "nvidia": return "🦙";
            case "groq": return "🚀";
            case "openrouter": return "💬";
            default: return "🤖";
        }
    }

    function updateTriggerUI() {
        const trigger = document.getElementById("modelButton");
        const topPill = document.getElementById("topModelPill");

        const icon = currentModel.icon || getModelIcon(currentModel.provider);
        const html = `
            <span class="model-btn-icon">${icon}</span>
            <span class="model-btn-name">${currentModel.name}</span>
            <i class="fa-solid fa-chevron-down model-chevron"></i>
        `;

        if (trigger) {
            trigger.innerHTML = html;
            trigger.setAttribute("title", `${currentModel.name} (${currentModel.badge || currentModel.provider})`);
        }

        if (topPill) {
            topPill.innerHTML = `
                <span class="pill-dot"></span>
                <span>${currentModel.name}</span>
            `;
        }
    }

    function renderMenu() {
        const menu = document.getElementById("modelMenu");
        if (!menu) return;

        menu.innerHTML = `
            <div class="model-menu-header">
                <span class="model-menu-title">Select AI Model</span>
                <span class="model-menu-badge">${availableModels.length} available</span>
            </div>
            <div class="model-menu-list">
                ${availableModels.map(m => {
                    const isSelected = m.id === currentModel.id;
                    const icon = m.icon || getModelIcon(m.provider);
                    return `
                            <div class="model-item ${isSelected ? "selected" : ""} ${m.available === false ? "unavailable" : ""}" data-model-id="${m.id}" role="menuitem" tabindex="${m.available === false ? "-1" : "0"}" aria-disabled="${m.available === false}">
                            <div class="model-item-top">
                                <div class="model-item-left">
                                    <span class="model-item-icon">${icon}</span>
                                    <span class="model-item-name">${m.name}</span>
                                </div>
                                <span class="model-item-badge badge-${m.provider}">${m.badge || m.provider}</span>
                            </div>
                            <div class="model-item-desc">${m.available === false ? "Not configured on this server" : (m.description || "")}</div>
                            ${m.capabilities ? `
                                <div class="model-caps">
                                    ${m.capabilities.map(cap => `<span class="cap-tag">${cap}</span>`).join("")}
                                </div>
                            ` : ""}
                        </div>
                    `;
                }).join("")}
            </div>
        `;

        // Bind click events on items
        menu.querySelectorAll(".model-item").forEach(item => {
            const id = item.dataset.modelId;
            const model = availableModels.find(m => m.id === id);

            const select = () => {
                if (!model || model.available === false) return;
                currentModel = model;
                localStorage.setItem("pixel-model", JSON.stringify(currentModel));
                updateTriggerUI();
                renderMenu();
                window.dispatchEvent(new CustomEvent("pixel-models-updated"));
                closeMenu();
            };

            item.addEventListener("click", select);
            item.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select();
                }
            });
        });
    }

    function toggleMenu() {
        const menu = document.getElementById("modelMenu");
        const trigger = document.getElementById("modelButton");
        if (!menu || !trigger) return;

        const isOpen = menu.classList.contains("show");
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    function openMenu() {
        const menu = document.getElementById("modelMenu");
        const trigger = document.getElementById("modelButton");
        if (!menu || !trigger) return;

        menu.classList.add("show");
        trigger.setAttribute("aria-expanded", "true");
        // Focus selected item
        const selected = menu.querySelector(".model-item.selected");
        if (selected) selected.focus();
    }

    function closeMenu() {
        const menu = document.getElementById("modelMenu");
        const trigger = document.getElementById("modelButton");
        if (!menu) return;

        menu.classList.remove("show");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
    }

    // Fetch live models from backend
    async function fetchModels() {
        try {
            const apiBase = window.API_BASE || "";
            const res = await fetch(`${apiBase}/api/models`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.success && Array.isArray(data.data) && data.data.length > 0) {
                availableModels = data.data.map(m => ({
                    ...m,
                    icon: getModelIcon(m.provider)
                }));
                const match = availableModels.find(m => m.id === savedModelId && m.available !== false);
                if (match) {
                    currentModel = match;
                } else {
                    currentModel = availableModels.find(m => m.id === "auto") || availableModels[0];
                    localStorage.setItem("pixel-model", JSON.stringify(currentModel));
                }
                updateTriggerUI();
                renderMenu();
                window.dispatchEvent(new CustomEvent("pixel-models-updated"));
                console.log("[Pixel Models] Loaded", availableModels.length, "models from API.");
            }
        } catch (err) {
            availableModels = [{ ...DEFAULT_MODELS[0], available: true }];
            currentModel = availableModels[0];
            updateTriggerUI();
            renderMenu();
            window.dispatchEvent(new CustomEvent("pixel-models-updated"));
            console.warn("[Pixel Models] Could not load server model availability:", err.message);
        }
    }

    // Initialize
    window.addEventListener("DOMContentLoaded", () => {
        const trigger = document.getElementById("modelButton");
        if (trigger) {
            trigger.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMenu();
            });
        }

        const topPill = document.getElementById("topModelPill");
        if (topPill) {
            topPill.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleMenu();
            });
        }

        document.addEventListener("click", (e) => {
            if (!e.target.closest(".model-selector") && !e.target.closest("#topModelPill")) {
                closeMenu();
            }
        });

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                closeMenu();
            }
        });

        updateTriggerUI();
        renderMenu();
        fetchModels();
    });

    // Global accessors
    window.getCurrentModel = () => currentModel;
    window.setCurrentModel = (modelId) => {
        const found = availableModels.find(m => m.id === modelId);
        if (found) {
            currentModel = found;
            localStorage.setItem("pixel-model", JSON.stringify(currentModel));
            updateTriggerUI();
            renderMenu();
        }
    };
    window.getAvailableModels = () => availableModels;
})();
