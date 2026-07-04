// ==========================================
// Pixel AI Chat Engine
// ==========================================

const sessionId = crypto.randomUUID();

console.log("Session:", sessionId);

const textarea = document.querySelector("textarea");
const sendBtn = document.querySelector(".send-btn");
const chatArea = document.getElementById("chatArea");
const welcome = document.querySelector(".welcome");

// ==========================================
// Add Message
// ==========================================

function addMessage(text, sender) {

    const message = document.createElement("div");

    message.className = `message ${sender}`;

    if (sender === "ai") {

        message.innerHTML = `
            <div class="ai-avatar">P</div>

            <div class="bubble">

                <span class="stream">${text}</span>

            </div>
        `;

    } else {

        message.innerHTML = `
            <div class="bubble">${text}</div>
        `;

    }

    chatArea.appendChild(message);

    chatArea.scrollTop = chatArea.scrollHeight;

    return message;

}

// ==========================================
// Thinking
// ==========================================

function showThinking() {

    const thinking = document.createElement("div");

    thinking.id = "thinking";

    thinking.className = "message ai";

    thinking.innerHTML = `

        <div class="ai-avatar">

            P

        </div>

        <div class="bubble">

            <div class="thinking">

                <div class="thinking-text">

                    ◈ Pixel is thinking...

                </div>

            </div>

        </div>

    `;

    chatArea.appendChild(thinking);

    chatArea.scrollTop = chatArea.scrollHeight;

}

function removeThinking() {

    const thinking = document.getElementById("thinking");

    if (thinking) thinking.remove();

}

// ==========================================
// Send Message
// ==========================================

async function sendMessage() {

    const text = textarea.value.trim();

    if (!text) return;

    welcome.classList.add("hide");

    addMessage(text, "user");

    textarea.value = "";

    textarea.style.height = "auto";

    sendBtn.disabled = true;

    showThinking();

    await getAIResponse(text);

    sendBtn.disabled = false;

    textarea.focus();

}

sendBtn.addEventListener("click", sendMessage);

// ==========================================
// Enter to Send
// ==========================================

textarea.addEventListener("keydown", async (e) => {

    if (e.key === "Enter" && !e.shiftKey) {

        e.preventDefault();

        if (!sendBtn.disabled) {

            await sendMessage();

        }

    }

});

// ==========================================
// Auto Resize
// ==========================================

textarea.addEventListener("input", () => {

    textarea.style.height = "0px";

    textarea.style.height = textarea.scrollHeight + "px";

});

// ==========================================
// Streaming Response
// ==========================================

async function getAIResponse(message) {

    const response = await fetch(`${API_BASE}/api/chat`, {

        method: "POST",

        headers: {

            "Content-Type": "application/json"

        },

        body: JSON.stringify({

            sessionId,

            message,

            model: currentModel.id

        })

    });

    removeThinking();

    // Create empty AI bubble

    const aiMessage = addMessage("", "ai");

    const streamElement = aiMessage.querySelector(".stream");

    const reader = response.body.getReader();

    const decoder = new TextDecoder();

    let fullText = "";

    while (true) {

        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);

        fullText += chunk;

        if (typeof formatMessage === "function") {

            streamElement.innerHTML = formatMessage(fullText);

        } else {

            streamElement.textContent = fullText;

        }

        chatArea.scrollTop = chatArea.scrollHeight;

    }

    streamElement.classList.remove("stream");

}
