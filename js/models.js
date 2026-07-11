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
        id: "llama-3.3-70b-versatile",
        name: "Fast",
        icon: "💬"
    },


    qwen: {
        id: "qwen/qwen3-32b",
        name: "Code",
        icon: "💻"
    },

        groq: {
        id: "groq/compound",
        name: "Thinking",
        icon: "⚡"
    },


};

let currentModel = MODELS.auto;

const savedModel = localStorage.getItem("pixel-model");

if (savedModel) {

    currentModel = JSON.parse(savedModel);

}

const button = document.getElementById("modelButton");
const menu = document.getElementById("modelMenu");

if (!button || !menu) {
    console.warn("Model selector is not available on this page.");
} else {

button.innerHTML = `
    ${currentModel.icon}
    ${currentModel.name}
    <span>▼</span>
`;


// ==========================================
// Model Selector Logic
// ==========================================

button.addEventListener("click", () => {
    menu.classList.toggle("show");
    button.setAttribute("aria-expanded", menu.classList.contains("show"));

});

document.querySelectorAll(".model-item").forEach(item => {

    item.addEventListener("click", () => {
        const key = item.dataset.model;

        currentModel = MODELS[key];

        button.innerHTML = `
            ${currentModel.icon}
            ${currentModel.name}
            <span>▼</span>
        `;

        menu.classList.remove("show");
        button.setAttribute("aria-expanded", "false");
        localStorage.setItem("pixel-model", JSON.stringify(currentModel));

    });

});

document.addEventListener("click", event => {
    if (!event.target.closest(".model-selector")) {
        menu.classList.remove("show");
        button.setAttribute("aria-expanded", "false");
    }
});
}
