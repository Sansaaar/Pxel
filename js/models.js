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
        name: "Llama 3.3 70B",
        icon: "💬"
    },

    qwen: {
        id: "qwen/qwen3-32b",
        name: "Qwen Coder",
        icon: "💻"
    },
    
            groq: {
        id: "groq/compound",
        name: "Groq Compound",
        icon: "⚡"
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
