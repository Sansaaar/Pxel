const chooseModel = require("./chooseModel");
const groq = require("../providers/groq");
const memory = require("../memory/conversations");

async function generate(sessionId, message, selectedModel) {

    let model = selectedModel;

    if (!model || model === "auto") {
        model = chooseModel(message);
    }

    console.log("Using model:", model);

    const history = memory.getConversation(sessionId);

    return await groq.generate(model, message);

}

module.exports = {
    generate
};
