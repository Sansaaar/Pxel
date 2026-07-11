// Pixel AI chat engine

console.log("Pixel Chat Loaded");

const textarea = document.querySelector("textarea");
const sendBtn = document.querySelector(".send-btn");
const chatArea = document.getElementById("chatArea");
const chatContainer = document.querySelector(".chat-container");
const welcome = document.querySelector(".welcome");
const cursorGlow = document.querySelector(".cursor-glow");

if (cursorGlow && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("pointermove", event => {
        cursorGlow.style.left = `${event.clientX}px`;
        cursorGlow.style.top = `${event.clientY}px`;
    }, { passive: true });
}

function shouldAutoScroll() {
    return localStorage.getItem("pixel-auto-scroll") !== "false";
}

function scrollToLatest() {
    if (shouldAutoScroll()) chatContainer.scrollTop = chatContainer.scrollHeight;
}

function createAssistantActions() {
    return `<div class="message-actions" aria-label="Assistant response actions">
        <button class="message-action" type="button" data-message-action="copy" title="Copy response"><i class="fa-regular fa-copy"></i></button>
        <button class="message-action" type="button" data-message-action="like" title="Good response"><i class="fa-regular fa-thumbs-up"></i></button>
        <button class="message-action" type="button" data-message-action="dislike" title="Poor response"><i class="fa-regular fa-thumbs-down"></i></button>
        <button class="message-action" type="button" data-message-action="retry" title="Regenerate response"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="message-action" type="button" data-message-action="download" title="Download response"><i class="fa-solid fa-download"></i></button>
    </div>`;
}

function addMessage(text, sender, { streaming = false } = {}) {
    const message = document.createElement("div");
    message.className = `message ${sender}`;
    message.dataset.rawText = text;

    if (sender === "ai") {
        message.innerHTML = `<div class="ai-avatar"><img src="assets/pixel.png" alt="Pixel"></div><div class="ai-message-body"><div class="bubble"><div class="message-content${streaming ? " stream" : ""}"></div></div>${createAssistantActions()}</div>`;
        const content = message.querySelector(".message-content");
        if (streaming) {
            content.textContent = text;
        } else {
            content.innerHTML = typeof formatMessage === "function"
                ? formatMessage(text)
                : text.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
        }
    } else {
        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = text;
        message.appendChild(bubble);
    }

    chatArea.appendChild(message);
    scrollToLatest();
    return message;
}

function showThinking() {
    removeThinking();
    const thinking = document.createElement("div");
    thinking.id = "thinking";
    thinking.className = "message ai";
    thinking.innerHTML = `<div class="ai-avatar"><img src="assets/pixel.png" alt="Pixel"></div><div class="ai-message-body"><div class="bubble"><div class="thinking"><span class="thinking-text">Pixel is thinking...</span></div></div></div>`;
    chatArea.appendChild(thinking);
    scrollToLatest();
}

function removeThinking() {
    document.getElementById("thinking")?.remove();
}

async function sendMessage() {
    const text = textarea.value.trim();
    if (!text || sendBtn.disabled) return;

    let isNewConversation = false;
    if (!currentConversation) {
        await createConversation();
        isNewConversation = true;
    }

    welcome.classList.add("hide");
    addMessage(text, "user");
    textarea.value = "";
    textarea.style.height = "auto";
    sendBtn.disabled = true;
    showThinking();

    try {
        await getAIResponse(text);
        if (isNewConversation) await renameConversation(currentConversation, text);
    } catch (error) {
        console.error("Unable to get an AI response:", error);
        removeThinking();
        addMessage("Sorry, I couldn't reach Pixel right now. Please try again.", "ai");
    } finally {
        sendBtn.disabled = false;
        textarea.focus();
    }
}

sendBtn.addEventListener("click", sendMessage);
textarea.addEventListener("keydown", async event => {
    if (event.key === "Enter" && !event.shiftKey && localStorage.getItem("pixel-send-with-enter") !== "false") {
        event.preventDefault();
        await sendMessage();
    }
});
textarea.addEventListener("input", () => {
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
});

async function getAIResponse(message) {
    const response = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: currentConversation, message, model: currentModel.id })
    });

    if (!response.ok || !response.body) throw new Error(`Chat request failed (${response.status})`);

    removeThinking();
    const aiMessage = addMessage("", "ai", { streaming: true });
    const content = aiMessage.querySelector(".message-content");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        content.textContent = fullText;
        aiMessage.dataset.rawText = fullText;
        scrollToLatest();
    }

    fullText += decoder.decode();
    aiMessage.dataset.rawText = fullText;
    content.innerHTML = typeof formatMessage === "function"
        ? formatMessage(fullText)
        : fullText.replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
    content.classList.remove("stream");
    scrollToLatest();
}

document.addEventListener("click", async event => {
    const actionButton = event.target.closest(".message-action");
    if (!actionButton) return;
    const message = actionButton.closest(".message.ai");
    const action = actionButton.dataset.messageAction;
    const text = message?.dataset.rawText || "";

    if (action === "copy") {
        await navigator.clipboard.writeText(text);
        actionButton.innerHTML = '<i class="fa-solid fa-check"></i>';
        setTimeout(() => { actionButton.innerHTML = '<i class="fa-regular fa-copy"></i>'; }, 1500);
    }
    if (action === "like" || action === "dislike") {
        message.querySelectorAll('[data-message-action="like"], [data-message-action="dislike"]').forEach(button => button.classList.remove("active"));
        actionButton.classList.add("active");
    }
    if (action === "retry") {
        const previousUserMessage = message.previousElementSibling?.classList.contains("user") ? message.previousElementSibling : null;
        if (!previousUserMessage || sendBtn.disabled) return;
        message.remove();
        sendBtn.disabled = true;
        showThinking();
        try { await getAIResponse(previousUserMessage.dataset.rawText); }
        catch (error) { removeThinking(); addMessage("Sorry, I couldn't regenerate that response. Please try again.", "ai"); }
        finally { sendBtn.disabled = false; }
    }
    if (action === "download") {
        const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "pixel-response.md";
        link.click();
        URL.revokeObjectURL(link.href);
    }
});
