// ==========================================
// Pixel AI Chat Engine
// ==========================================

//session id
let sessionId = localStorage.getItem("pixel-session");

if (!sessionId) {

    sessionId = crypto.randomUUID();

    localStorage.setItem("pixel-session", sessionId);

}

const textarea = document.querySelector("textarea");

const sendBtn = document.querySelector(".send-btn");

const chatArea = document.getElementById("chatArea");

const welcome = document.querySelector(".welcome");

function addMessage(text, sender){

    const message = document.createElement("div");

    message.classList.add("message", sender);

    if(sender === "ai"){

        message.innerHTML = `

        <div class="ai-avatar">

            P

        </div>

        <div class="bubble">

            ${text}

        </div>

        `;

    }

    else{

        message.innerHTML = `

        <div class="bubble">

            ${text}

        </div>

        `;

    }

    chatArea.appendChild(message);

    chatArea.scrollTop = chatArea.scrollHeight;

}


async function pixelReply(){

    const thinking = document.createElement("div");

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

    await new Promise(resolve => setTimeout(resolve,1200));

    thinking.remove();

    streamMessage(
        "Hello! I'm Pixel. NVIDIA AI integration is coming soon 🚀"
    );

}

async function streamMessage(text){

    const message = document.createElement("div");

    message.className = "message ai";

    message.innerHTML = `

        <div class="ai-avatar">

            P

        </div>

        <div class="bubble">

            <span class="stream"></span>

        </div>

    `;

    chatArea.appendChild(message);

    const stream = message.querySelector(".stream");

const words = text.split(" ");

for(const word of words){

    stream.textContent += word + " ";

    chatArea.scrollTop = chatArea.scrollHeight;

    await new Promise(resolve=>setTimeout(resolve,70));

}

    stream.classList.remove("stream");

}


async function sendMessage(){

    const text=textarea.value.trim();

    if(!text) return;

    welcome.classList.add("hide");

    createUserMessage(text);

    textarea.value="";

    textarea.style.height="auto";

    sendBtn.disabled=true;

    showThinking();

    const reply=await getAIResponse(text);

    removeThinking();

    createAIMessage(reply);

    sendBtn.disabled=false;

    textarea.focus();

}
sendBtn.addEventListener("click",sendMessage);


// ==========================================
// Enter to Send
// Shift + Enter = New Line
// ==========================================

textarea.addEventListener("keydown", async (e) => {

    // Shift + Enter → New line
    if (e.key === "Enter" && e.shiftKey) {

        return;

    }

    // Enter → Send
    if (e.key === "Enter") {

        e.preventDefault();

        if (sendBtn.disabled) return;

        await sendMessage();

    }

});


// ==========================================
// Auto Grow Textarea
// ==========================================

function autoResize(){

    textarea.style.height = "0px";

    textarea.style.height = textarea.scrollHeight + "px";

}

textarea.addEventListener("input", autoResize);

function createUserMessage(text){

    addMessage(text,"user");

}

function createAIMessage(text){

    streamMessage(text);

}

function showThinking(){

    const thinking = document.createElement("div");

    thinking.className="message ai";

    thinking.id="thinking";

    thinking.innerHTML=`

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

    chatArea.scrollTop=chatArea.scrollHeight;

}

function removeThinking(){

    const thinking=document.getElementById("thinking");

    if(thinking){

        thinking.remove();

    }

}

async function getAIResponse(message){

    const response = await fetch(`${API_BASE}/api/chat`, {

        method:"POST",

        headers:{
            "Content-Type":"application/json"
        },

       body: JSON.stringify({

    sessionId,
    message,
    model: currentModel.id

})

    });

const data = await response.json();

if (!response.ok) {

    throw new Error(data.error || "Unknown server error");

}

return data.reply;

}
