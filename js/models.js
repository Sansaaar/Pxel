// ==========================================
// Pixel AI Models
// ==========================================

console.log("models.js loaded");

const MODELS = {

    auto: {
        id: "auto",
        name: "Auto",
        icon: "✨"
    },

    llama: {
        id: "meta/llama-3.3-70b-instruct",
        name: "Llama 3.3 70B",
        icon: "💬"
    },

    deepseek: {
        id: "deepseek-ai/deepseek-r1",
        name: "DeepSeek R1",
        icon: "🧠"
    },

    qwen: {
        id: "qwen/qwen2.5-coder-32b-instruct",
        name: "Qwen Coder",
        icon: "💻"
    },

    mistral: {
        id: "mistralai/mistral-small",
        name: "Mistral Small",
        icon: "⚡"
    },

    gemma: {
        id: "google/gemma-2-2b-it",
        name: "Gemma",
        icon: "✍️"
    }

};

let currentModel = MODELS.auto;

const savedModel = localStorage.getItem("pixel-model");

if (savedModel) {

    currentModel = JSON.parse(savedModel);

}


// ==========================================
// Model Selector Logic
// ==========================================

const button = document.getElementById("modelButton");

const menu = document.getElementById("modelMenu");

console.log(button);
console.log(menu);

button.addEventListener("click", () => {

    console.log("Button clicked");

    menu.classList.toggle("show");

    console.log(menu.className);

});

document.querySelectorAll(".model-item").forEach(item => {

    item.addEventListener("click", () => {
            console.log(item.dataset.model);

        const key = item.dataset.model;

        currentModel = MODELS[key];

        console.log(currentModel);

        button.innerHTML = `
            ${currentModel.icon}
            ${currentModel.name}
            <span>▼</span>
        `;

        menu.classList.remove("show");

    });

});