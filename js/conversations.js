// ==========================================
// Pixel Conversations
// ==========================================

if (!window.supabaseClient) {
    console.error("Supabase client not initialized.");
}

let currentConversation =
    localStorage.getItem("currentConversation");


// ==========================================
// Create Conversation
// ==========================================

async function createConversation() {

    const {
        data: { user }
    } = await window.supabaseClient.auth.getUser();

    if (!user) return null;

    const { data, error } =
        await window.supabaseClient

        .from("conversations")

        .insert({

            user_id: user.id,
            title: "New Chat"

        })

        .select()

        .single();

    if (error) {

        console.error(error);

        return null;

    }

    currentConversation = data.id;

    localStorage.setItem(
        "currentConversation",
        currentConversation
    );

    await loadConversations();

    return currentConversation;

}



// ==========================================
// Date Group
// ==========================================

function getGroup(date) {

    const created = new Date(date);

    const today = new Date();

    const diff =

        Math.floor(

            (today - created)

            / 86400000

        );

    if (diff === 0)

        return "today";

    if (diff === 1)

        return "yesterday";

    if (diff < 7)

        return "week";

    return "month";

}



// ==========================================
// Load Conversations
// ==========================================

async function loadConversations() {

    const {

        data: { user }

    } = await window.supabaseClient.auth.getUser();

    if (!user) return;

    const { data, error } =
        await window.supabaseClient

        .from("conversations")

        .select("*")

        .eq("user_id", user.id)

        .order("created_at", {

            ascending:false

        });

    if (error) {

        console.error(error);

        return;

    }

    const lists = {

        today:
        document.getElementById("todayList"),

        yesterday:
        document.getElementById("yesterdayList"),

        week:
        document.getElementById("weekList"),

        month:
        document.getElementById("monthList")

    };

    Object.values(lists)

        .forEach(list =>

            list.innerHTML = ""

        );

    data
    .sort((a, b) => Number(isPinnedConversation(b.id)) - Number(isPinnedConversation(a.id)))
    .forEach(conversation => {

        const group =
            getGroup(conversation.created_at);

        const item =
            document.createElement("div");

        item.className =
            "conversation-item";

        item.dataset.conversationId = conversation.id;
        item.dataset.conversationTitle = conversation.title;

        if (isPinnedConversation(conversation.id)) {
            item.classList.add("pinned");
        }

        if (
            conversation.id ==
            currentConversation
        ){

            item.classList.add("active");

        }

        const title = document.createElement("span");
        title.className = "chat-name";
        title.textContent = conversation.title;
        item.appendChild(title);

        item.onclick = () => {

            currentConversation =
                conversation.id;

            localStorage.setItem(

                "currentConversation",

                currentConversation

            );

            loadMessages(conversation.id);

            loadConversations();

        };

        lists[group].appendChild(item);

    });

    hideEmptyGroups();

}



// ==========================================
// Hide Empty Groups
// ==========================================

function hideEmptyGroups(){

    [

        "today",

        "yesterday",

        "week",

        "month"

    ].forEach(group=>{

        const wrapper =
            document
            .getElementById(
                group+"Group"
            );

        const list =
            document
            .getElementById(
                group+"List"
            );

        wrapper.style.display =

            list.children.length

            ? "block"

            : "none";

    });

}



// ==========================================
// Load Messages
// ==========================================

async function loadMessages(conversationId){

    const { data,error } =

        await window.supabaseClient

        .from("messages")

        .select("*")

        .eq(
            "conversation_id",
            conversationId
        )

        .order("created_at",{

            ascending:true

        });

    if(error){

        console.error(error);

        return;

    }

    currentConversation =
        conversationId;

    localStorage.setItem(

        "currentConversation",

        conversationId

    );

    chatArea.innerHTML = "";

    welcome.classList.add("hide");

    data.forEach(msg=>{

        addMessage(

            msg.content,

            msg.role==="assistant"

                ? "ai"

                : "user"

        );

    });

}



// ==========================================
// New Chat
// ==========================================

async function newChat(){

    currentConversation = null;

    localStorage.removeItem(

        "currentConversation"

    );

    chatArea.innerHTML = "";

    welcome.classList.remove("hide");

    textarea.value = "";

    textarea.style.height = "auto";

    loadConversations();

}

document

.getElementById("newChatBtn")

.addEventListener(

    "click",

    newChat

);



// ==========================================
// Rename Conversation
// ==========================================

async function renameConversation(

    conversationId,

    firstMessage

){

    if(!conversationId) return;

    let title =
        firstMessage

        .replace(/\n/g," ")

        .trim();

    if(title.length>40){

        title =
            title.substring(0,40)+"...";

    }

    await window.supabaseClient

    .from("conversations")

    .update({

        title

    })

    .eq(

        "id",

        conversationId

    );

    loadConversations();

}



// ==========================================
// Startup
// ==========================================

window.addEventListener("load",async()=>{

    await loadConversations();

    if(currentConversation){

        loadMessages(currentConversation);

    }

});

function isPinnedConversation(conversationId) {
    return JSON.parse(localStorage.getItem("pixel-pinned-chats") || "[]")
        .includes(conversationId);
}
