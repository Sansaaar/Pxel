// ==========================================
// Pixel AI: Conversations Persistence & Manager
// ==========================================

(function() {
    let currentConversation = localStorage.getItem("currentConversation") || null;
    let localConversations = [];
    let localMessages = {};

    function generateUUID() {
        if (typeof crypto !== "undefined" && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            const v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Load local storage fallback cache
    try {
        localConversations = JSON.parse(localStorage.getItem("pixel-local-convs") || "[]");
        localMessages = JSON.parse(localStorage.getItem("pixel-local-msgs") || "{}");
    } catch (e) {
        localConversations = [];
        localMessages = {};
    }

    function saveLocalData() {
        try {
            localStorage.setItem("pixel-local-convs", JSON.stringify(localConversations));
            localStorage.setItem("pixel-local-msgs", JSON.stringify(localMessages));
        } catch (e) {
            console.warn("[Pixel Convs] Storage quota exceeded:", e);
        }
    }

    async function getUser() {
        if (!window.supabaseClient) return null;
        try {
            const { data } = await window.supabaseClient.auth.getUser();
            return data?.user || null;
        } catch {
            return null;
        }
    }

    // Date Categorization
    function getGroup(dateString) {
        if (!dateString) return "today";
        const created = new Date(dateString);
        const today = new Date();
        const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate());

        const diffDays = Math.round((startOfToday - startOfCreated) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return "today";
        if (diffDays === 1) return "yesterday";
        if (diffDays < 7) return "week";
        return "month";
    }

    function isPinned(id) {
        try {
            const pinned = JSON.parse(localStorage.getItem("pixel-pinned-chats") || "[]");
            return pinned.includes(id);
        } catch {
            return false;
        }
    }

    function togglePin(id) {
        try {
            let pinned = JSON.parse(localStorage.getItem("pixel-pinned-chats") || "[]");
            if (pinned.includes(id)) {
                pinned = pinned.filter(p => p !== id);
            } else {
                pinned.unshift(id);
            }
            localStorage.setItem("pixel-pinned-chats", JSON.stringify(pinned));
            loadConversations();
        } catch (e) {
            console.error(e);
        }
    }

    function updateTopTitle(title) {
        const titleEl = document.getElementById("currentChatTitle");
        if (titleEl) {
            titleEl.textContent = title || "New Chat";
        }
    }

    // ------------------------------------------
    // Create Conversation
    // ------------------------------------------
    async function createConversation(initialTitle = "New Chat") {
        const user = await getUser();
        const id = generateUUID();
        const now = new Date().toISOString();

        let newConv = {
            id,
            title: initialTitle,
            created_at: now,
            updated_at: now
        };

        if (user && user.id) {
            try {
                const { data, error } = await window.supabaseClient
                    .from("conversations")
                    .insert({
                        user_id: user.id,
                        title: initialTitle
                    })
                    .select()
                    .single();

                if (!error && data) {
                    newConv = data;
                }
            } catch (err) {
                console.warn("[Pixel Convs] Supabase insert fallback to local:", err.message);
            }
        }

        // Always keep local list updated
        localConversations = localConversations.filter(c => c.id !== newConv.id);
        localConversations.unshift(newConv);
        saveLocalData();

        currentConversation = newConv.id;
        localStorage.setItem("currentConversation", currentConversation);

        updateTopTitle(newConv.title);
        await loadConversations();
        return currentConversation;
    }

    // ------------------------------------------
    // Load Conversations List
    // ------------------------------------------
    async function loadConversations() {
        const user = await getUser();
        let convs = [...localConversations];

        if (user && user.id && window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from("conversations")
                    .select("*")
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false });

                if (!error && Array.isArray(data)) {
                    // Merge Supabase convs with local convs
                    const remoteIds = new Set(data.map(c => c.id));
                    const uniqueLocal = localConversations.filter(c => !remoteIds.has(c.id));
                    convs = [...data, ...uniqueLocal];
                }
            } catch (err) {
                console.warn("[Pixel Convs] Could not load from Supabase:", err.message);
            }
        }

        const groups = {
            today: document.getElementById("todayList"),
            yesterday: document.getElementById("yesterdayList"),
            week: document.getElementById("weekList"),
            month: document.getElementById("monthList")
        };

        // Reset list DOM
        Object.values(groups).forEach(el => {
            if (el) el.innerHTML = "";
        });

        // Sort: pinned first, then newest
        convs.sort((a, b) => {
            const aPinned = isPinned(a.id) ? 1 : 0;
            const bPinned = isPinned(b.id) ? 1 : 0;
            if (aPinned !== bPinned) return bPinned - aPinned;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        convs.forEach(conv => {
            const groupName = getGroup(conv.created_at);
            const container = groups[groupName];
            if (!container) return;

            const item = document.createElement("div");
            item.className = "conversation-item";
            item.dataset.conversationId = conv.id;
            item.dataset.conversationTitle = conv.title || "Untitled";

            const active = conv.id === currentConversation;
            if (active) {
                item.classList.add("active");
                updateTopTitle(conv.title);
            }
            if (isPinned(conv.id)) {
                item.classList.add("pinned");
            }

            item.innerHTML = `
                <i class="fa-regular fa-message item-icon"></i>
                <span class="chat-name">${escapeHtml(conv.title || "Untitled")}</span>
                ${isPinned(conv.id) ? `<i class="fa-solid fa-thumbtack pin-badge" title="Pinned"></i>` : ""}
                <button class="item-menu-btn" type="button" aria-label="Conversation options" title="Options">
                    <i class="fa-solid fa-ellipsis"></i>
                </button>
            `;

            // Select conversation on click
            item.addEventListener("click", (e) => {
                if (e.target.closest(".item-menu-btn")) return;
                selectConversation(conv.id, conv.title);
            });

            // Options menu trigger
            const menuBtn = item.querySelector(".item-menu-btn");
            menuBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                openConversationMenu(conv, e);
            });

            container.appendChild(item);
        });

        // Hide empty groups
        ["today", "yesterday", "week", "month"].forEach(g => {
            const wrapper = document.getElementById(g + "Group");
            const list = groups[g];
            if (wrapper && list) {
                wrapper.style.display = list.children.length ? "block" : "none";
            }
        });
    }

    function selectConversation(id, title) {
        currentConversation = id;
        localStorage.setItem("currentConversation", id);
        updateTopTitle(title);
        loadMessages(id);
        loadConversations();
    }

    // ------------------------------------------
    // Load Messages for Conversation
    // ------------------------------------------
    async function loadMessages(conversationId) {
        if (!conversationId) return;

        currentConversation = conversationId;
        localStorage.setItem("currentConversation", conversationId);

        const chatArea = document.getElementById("chatArea");
        const welcome = document.querySelector(".welcome");
        if (chatArea) {
            window.clearMathTypesetting?.(chatArea);
            chatArea.innerHTML = "";
        }
        if (welcome) welcome.classList.add("hide");

        let messages = [];

        // Check local messages cache first
        if (localMessages[conversationId] && localMessages[conversationId].length) {
            messages = [...localMessages[conversationId]];
        }

        // Fetch from Supabase if valid UUID
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId);
        if (isUUID && window.supabaseClient) {
            try {
                const { data, error } = await window.supabaseClient
                    .from("messages")
                    .select("*")
                    .eq("conversation_id", conversationId)
                    .order("created_at", { ascending: true });

                if (!error && Array.isArray(data) && data.length) {
                    messages = data;
                    localMessages[conversationId] = data;
                    saveLocalData();
                }
            } catch (err) {
                console.warn("[Pixel Convs] Remote messages load failed:", err.message);
            }
        }

        if (messages.length === 0) {
            if (welcome) welcome.classList.remove("hide");
            return;
        }

        messages.forEach(msg => {
            if (typeof window.addMessageToUI === "function") {
                window.addMessageToUI(msg.content, msg.role === "assistant" ? "ai" : "user");
            }
        });
    }

    // ------------------------------------------
    // New Chat
    // ------------------------------------------
    function newChat() {
        currentConversation = null;
        localStorage.removeItem("currentConversation");

        const chatArea = document.getElementById("chatArea");
        const welcome = document.querySelector(".welcome");
        const textarea = document.getElementById("promptInput");

        if (chatArea) {
            window.clearMathTypesetting?.(chatArea);
            chatArea.innerHTML = "";
        }
        if (welcome) welcome.classList.remove("hide");
        if (textarea) {
            textarea.value = "";
            textarea.style.height = "auto";
            textarea.focus();
        }

        updateTopTitle("New Chat");
        loadConversations();
    }

    // ------------------------------------------
    // Rename Conversation
    // ------------------------------------------
    async function renameConversation(id, newTitle) {
        if (!id || !newTitle) return;
        const cleanTitle = newTitle.replace(/\n/g, " ").trim().slice(0, 60);

        // Update local
        const found = localConversations.find(c => c.id === id);
        if (found) {
            found.title = cleanTitle;
            saveLocalData();
        }

        // Update remote
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        if (isUUID && window.supabaseClient) {
            try {
                await window.supabaseClient
                    .from("conversations")
                    .update({ title: cleanTitle })
                    .eq("id", id);
            } catch (e) {
                console.warn("[Pixel Convs] Rename failed on server:", e.message);
            }
        }

        if (currentConversation === id) {
            updateTopTitle(cleanTitle);
        }

        await loadConversations();
    }

    // ------------------------------------------
    // Delete Conversation
    // ------------------------------------------
    async function deleteConversation(id) {
        if (!id) return;

        localConversations = localConversations.filter(c => c.id !== id);
        delete localMessages[id];
        saveLocalData();

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
        if (isUUID && window.supabaseClient) {
            try {
                await window.supabaseClient.from("messages").delete().eq("conversation_id", id);
                await window.supabaseClient.from("conversations").delete().eq("id", id);
            } catch (e) {
                console.warn("[Pixel Convs] Delete error on server:", e.message);
            }
        }

        if (currentConversation === id) {
            newChat();
        } else {
            await loadConversations();
        }
    }

    // ------------------------------------------
    // Clear All Conversations
    // ------------------------------------------
    async function clearAllConversations() {
        const user = await getUser();
        localConversations = [];
        localMessages = {};
        saveLocalData();

        if (user && window.supabaseClient) {
            try {
                const { data } = await window.supabaseClient
                    .from("conversations")
                    .select("id")
                    .eq("user_id", user.id);

                if (data && data.length) {
                    const ids = data.map(c => c.id);
                    await window.supabaseClient.from("messages").delete().in("conversation_id", ids);
                    await window.supabaseClient.from("conversations").delete().eq("user_id", user.id);
                }
            } catch (e) {
                console.warn("[Pixel Convs] Clear all error:", e.message);
            }
        }

        newChat();
    }

    function recordLocalMessage(convId, role, content) {
        if (!convId) return;
        if (!localMessages[convId]) localMessages[convId] = [];
        localMessages[convId].push({
            conversation_id: convId,
            role,
            content,
            created_at: new Date().toISOString()
        });
        saveLocalData();
    }

    // Helper: Context menu
    function openConversationMenu(conv, event) {
        const menu = document.getElementById("chatContextMenu");
        if (!menu) return;

        window.contextConversation = conv;
        menu.style.left = `${Math.min(event.clientX, window.innerWidth - 220)}px`;
        menu.style.top = `${Math.min(event.clientY, window.innerHeight - 170)}px`;
        menu.classList.add("show");
    }

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[c]);
    }

    // Bindings
    window.addEventListener("DOMContentLoaded", async () => {
        const newChatBtn = document.getElementById("newChatBtn");
        const topNewChatBtn = document.getElementById("topNewChatBtn");

        if (newChatBtn) newChatBtn.addEventListener("click", newChat);
        if (topNewChatBtn) topNewChatBtn.addEventListener("click", newChat);

        const titleBtn = document.getElementById("currentChatTitle");
        if (titleBtn) {
            titleBtn.addEventListener("click", () => {
                if (!currentConversation) return;
                const newTitle = window.prompt("Rename this conversation:", titleBtn.textContent);
                if (newTitle && newTitle.trim()) {
                    renameConversation(currentConversation, newTitle.trim());
                }
            });
        }

        await loadConversations();
        if (currentConversation) {
            await loadMessages(currentConversation);
        }
    });

    // Public API
    window.createConversation = createConversation;
    window.loadConversations = loadConversations;
    window.loadMessages = loadMessages;
    window.newChat = newChat;
    window.renameConversation = renameConversation;
    window.deleteConversation = deleteConversation;
    window.clearAllConversations = clearAllConversations;
    window.togglePin = togglePin;
    window.recordLocalMessage = recordLocalMessage;
    window.getCurrentConversationId = () => currentConversation;
    window.setCurrentConversationId = (id) => { currentConversation = id; };
})();
