// ==========================================
// Pixel AI 2.0: User Chat Controller — Production-Ready Advanced Edition
// Supporting: Reply, Edit, Delete, Copy, Reactions, Pin, Forward, Read/Seen Status,
//             Multi-select Batch Mode, Link Detection, Markdown Code Blocks, Drag & Drop Attachments.
// ==========================================

(function () {
    "use strict";

    // ── State ─────────────────────────────────────
    let currentUser = null;
    let activeChatId = null;
    let activeChatObj = null;
    const attachmentUrlCache = new Map();
    let conversationsList = [];
    let activeMessagesList = [];
    let pendingAttachments = [];
    let replyingTo = null;
    let editingMessage = null;
    let sidebarSearchQuery = "";
    let unreadNewMessagesCount = 0;
    let eventSource = null;
    let supabaseChannel = null;
    let typingTimer = null;
    let isCurrentlyTyping = false;
    let typingUsers = {};
    let presencePingTimer = null;

    // Multi-Select State
    let isMultiSelectMode = false;
    let selectedMsgIds = new Set();
    let forwardingMessage = null;

    // ── DOM Elements ──────────────────────────────
    const chatListContainer  = document.getElementById("userChatList");
    const messagesArea       = document.getElementById("userChatMessagesArea");
    const headerName         = document.getElementById("userChatHeaderName");
    const headerDetails      = document.getElementById("userChatHeaderDetails");
    const headerAvatar       = document.getElementById("userChatHeaderAvatar");
    const messageInput       = document.getElementById("userChatMessageInput");
    const sendBtn            = document.getElementById("userChatSendBtn");
    const attachBtn          = document.getElementById("userChatAttachBtn");
    const fileInput          = document.getElementById("userChatFileInput");
    const attachmentsPreview = document.getElementById("userChatAttachmentsPreview");
    const roomCodePill       = document.getElementById("userChatRoomCodePill");
    const roomCodeText       = document.getElementById("userChatRoomCodeText");
    const deleteRoomBtn      = document.getElementById("userChatDeleteRoomBtn");
    const participantsBtn    = document.getElementById("userChatParticipantsBtn");
    const clearHistoryBtn    = document.getElementById("userChatClearHistoryBtn");
    const searchToggleBtn    = document.getElementById("userChatSearchToggleBtn");
    const searchWrap         = document.getElementById("userChatSearchWrap");
    const searchInput        = document.getElementById("userChatSearchInput");
    const topicBar           = document.getElementById("userChatTopicBar");
    const topicText          = document.getElementById("userChatTopicText");
    const editTopicBtn       = document.getElementById("userChatEditTopicBtn");
    const globalUnreadBadge  = document.getElementById("globalUnreadBadge");
    const typingIndicator    = document.getElementById("userChatTypingIndicator");
    const replyBar           = document.getElementById("userChatReplyBar");
    const replyBarText       = document.getElementById("userChatReplyBarText");
    const cancelReplyBtn     = document.getElementById("userChatCancelReplyBtn");
    const pinnedBtn          = document.getElementById("userChatPinnedBtn");
    const pinnedPanel        = document.getElementById("userChatPinnedPanel");
    const pinnedList         = document.getElementById("userChatPinnedList");

    // Modals & Multi-select
    const createRoomModal     = document.getElementById("createRoomModal");
    const joinRoomModal       = document.getElementById("joinRoomModal");
    const searchUserModal     = document.getElementById("searchUserModal");
    const participantsModal   = document.getElementById("roomParticipantsModal");
    const forwardModal        = document.getElementById("forwardMessageModal");
    const forwardTargetList   = document.getElementById("forwardTargetList");
    const multiSelectBar      = document.getElementById("userChatMultiSelectBar");
    const multiSelectCount    = document.getElementById("multiSelectCount");
    const batchCopyBtn        = document.getElementById("batchCopyBtn");
    const batchForwardBtn     = document.getElementById("batchForwardBtn");
    const batchDeleteBtn      = document.getElementById("batchDeleteBtn");
    const cancelMultiSelectBtn = document.getElementById("cancelMultiSelectBtn");

    const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "😮", "🚀", "💡", "😢"];
    const SAFE_ATTACHMENT_TYPES = new Set([
        "image/png", "image/jpeg", "image/gif", "image/webp",
        "application/pdf", "application/json", "text/plain", "text/markdown", "text/csv",
        "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "video/mp4", "video/webm"
    ]);

    // ── Helpers ───────────────────────────────────
    function esc(str) {
        if (!str && str !== 0) return "";
        const d = document.createElement("div");
        d.textContent = String(str);
        return d.innerHTML;
    }

    function buildUrl(path) {
        if (!path) return "";
        if (path.startsWith("http://") || path.startsWith("https://")) return path;
        const base = window.API_BASE !== undefined
            ? window.API_BASE
            : (location.port === "3000" || location.port === "3001" ? "" : "http://localhost:3000");
        const cleanPath = path.startsWith("/") ? path : "/" + path;
        return `${base}${cleanPath}`;
    }

    async function getAuthHeaders() {
        const headers = { "Content-Type": "application/json" };
        if (window.supabaseClient) {
            try {
                const { data } = await window.supabaseClient.auth.getSession();
                if (data?.session?.access_token) {
                    headers["Authorization"] = `Bearer ${data.session.access_token}`;
                }
            } catch (e) {
                console.warn("[UserChat] Session retrieval error:", e);
            }
        }
        return headers;
    }

    async function api(path, options = {}) {
        try {
            const authHeaders = await getAuthHeaders();
            const fullUrl = buildUrl(path);
            const response = await fetch(fullUrl, {
                ...options,
                headers: {
                    ...authHeaders,
                    ...(options.headers || {})
                }
            });

            const contentType = response.headers.get("content-type") || "";
            let json = {};

            if (contentType.includes("application/json")) {
                json = await response.json();
            } else {
                const text = await response.text();
                console.warn(`[UserChat API non-JSON response] ${response.status} ${fullUrl}:`, text.substring(0, 200));
                json = {
                    success: false,
                    error: response.status === 404
                        ? "API endpoint not found. Please ensure backend server is running with 'node backend/server.js'."
                        : `Server error (${response.status})`
                };
            }

            if (!response.ok && !json.error) {
                if (response.status === 401) json.error = "Please sign in again.";
                else if (response.status === 403) json.error = "You are not a member of this conversation.";
                else if (response.status === 404) json.error = "Resource not found.";
                else json.error = `Server error (${response.status})`;
            }

            return json;
        } catch (err) {
            console.error(`[UserChat Network Error] ${path}:`, err);
            return {
                success: false,
                error: "Unable to connect to Pixel server. Please check backend connection."
            };
        }
    }

    // ── User Identity ─────────────────────────────
    function initUserIdentity() {
        let resolvedUser = null;
        if (window.currentUser && window.currentUser.id && window.currentUser.id !== "guest-user") {
            resolvedUser = {
                id: window.currentUser.id,
                email: window.currentUser.email || "user@pixel.local",
                display_name:
                    localStorage.getItem("pixel-display-name") ||
                    window.currentUser.user_metadata?.display_name ||
                    (window.currentUser.email ? window.currentUser.email.split("@")[0] : "Pixel User")
            };
        } else {
            resolvedUser = null;
            showSignInRequired();
        }
        if (currentUser?.id === resolvedUser?.id) return;
        currentUser = resolvedUser;
        syncAuth();
    }

    function showSignInRequired() {
        if (!messagesArea) return;
        messagesArea.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-state-icon"><i class="fa-solid fa-lock" aria-hidden="true"></i></div>
                <h2>Sign in to use rooms</h2>
                <p>Shared chats are available to signed-in Pixel accounts.</p>
                <a class="chat-action-btn primary" href="login.html">Sign in</a>
            </div>`;
    }

    async function syncAuth() {
        if (!currentUser) return;
        try {
            await api("/api/user-chat/auth", {
                method: "POST",
                body: JSON.stringify({ user: currentUser })
            });
            startSseStream();
            subscribeSupabaseRealtime();
            loadConversations();
            startPresencePing();
        } catch (e) {
            console.warn("[UserChat] Auth sync warning:", e);
        }
    }

    function startPresencePing() {
        if (presencePingTimer) return;
        presencePingTimer = setInterval(() => {
            if (currentUser) api("/api/user-chat/ping", { method: "POST" }).catch(() => {});
        }, 30000);
    }

    async function startSseStream() {
        if (!currentUser || eventSource) return;
        try {
            const ticketData = await api("/api/user-chat/stream-ticket", { method: "POST" });
            if (!ticketData.success || !ticketData.ticket) return;
            const url = buildUrl(`/api/user-chat/stream?ticket=${encodeURIComponent(ticketData.ticket)}`);
            eventSource = new EventSource(url);
            eventSource.onmessage = e => {
                try { handleServerEvent(JSON.parse(e.data)); } catch (_) {}
            };
            eventSource.onerror = () => {
                eventSource.close();
                eventSource = null;
                setTimeout(startSseStream, 5000);
            };
        } catch (error) {
            console.warn("[UserChat] Secure event stream could not be started.");
        }
    }

    function subscribeSupabaseRealtime() {
        if (!window.supabaseClient) return;
        if (supabaseChannel) { window.supabaseClient.removeChannel(supabaseChannel); }

        supabaseChannel = window.supabaseClient
            .channel("pixel-chat-global")
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "pixel_chat_messages"
            }, payload => {
                const msg = payload.new;
                if (!msg) return;

                if (msg.chat_id === activeChatId) {
                    const normalised = { ...msg, timestamp: msg.created_at };
                    const tempIdx = activeMessagesList.findIndex(m => m.id.startsWith("temp_") && m.content === msg.content);
                    if (tempIdx > -1) {
                        activeMessagesList[tempIdx] = normalised;
                    } else if (!activeMessagesList.some(m => m.id === msg.id)) {
                        activeMessagesList.push(normalised);
                    }
                    renderMessages();
                    smartScrollToBottom(false);
                }
                loadConversations();
            })
            .on("postgres_changes", {
                event: "UPDATE",
                schema: "public",
                table: "pixel_chat_messages"
            }, payload => {
                const msg = payload.new;
                if (!msg || msg.chat_id !== activeChatId) return;
                const idx = activeMessagesList.findIndex(m => m.id === msg.id);
                if (idx > -1) {
                    activeMessagesList[idx] = { ...msg, timestamp: msg.created_at };
                    renderMessages();
                }
            })
            .on("postgres_changes", {
                event: "INSERT",
                schema: "public",
                table: "pixel_chat_typing"
            }, payload => {
                const t = payload.new;
                if (!t || t.user_id === currentUser.id || t.chat_id !== activeChatId) return;
                showTyping(t.user_id, t.user_name);
            })
            .on("postgres_changes", {
                event: "DELETE",
                schema: "public",
                table: "pixel_chat_typing"
            }, payload => {
                const t = payload.old;
                if (!t || t.chat_id !== activeChatId) return;
                hideTyping(t.user_id);
            })
            .on("postgres_changes", {
                event: "*",
                schema: "public",
                table: "pixel_chat_room_members"
            }, () => { loadConversations(); })
            .subscribe();
    }

    function handleServerEvent(data) {
        switch (data.type) {
            case "new_message":
                if (data.chatId === activeChatId) {
                    const tempIdx = activeMessagesList.findIndex(m => m.id.startsWith("temp_") && m.content === data.message.content);
                    if (tempIdx > -1) {
                        activeMessagesList[tempIdx] = data.message;
                    } else if (!activeMessagesList.some(m => m.id === data.message.id)) {
                        activeMessagesList.push(data.message);
                    }
                    renderMessages();
                    smartScrollToBottom(false);
                }
                loadConversations();
                break;
            case "reaction_updated":
                if (data.chatId === activeChatId) {
                    const m = activeMessagesList.find(m => m.id === data.messageId);
                    if (m) { m.reactions = data.reactions; renderMessages(); }
                }
                break;
            case "message_edited":
                if (data.chatId === activeChatId) {
                    const idx = activeMessagesList.findIndex(m => m.id === data.message.id);
                    if (idx > -1) { activeMessagesList[idx] = data.message; renderMessages(); }
                }
                break;
            case "message_deleted":
                if (data.chatId === activeChatId) {
                    activeMessagesList = activeMessagesList.filter(m => m.id !== data.messageId);
                    renderMessages();
                }
                break;
            case "history_cleared":
                if (data.chatId === activeChatId) {
                    activeMessagesList = [];
                    renderEmptyState("Chat history cleared.");
                }
                break;
            case "room_deleted":
                if (data.chatId === activeChatId) {
                    activeChatId = null;
                    activeChatObj = null;
                    renderEmptyState("This room was closed by its creator.");
                    updateChatHeader(null);
                }
                loadConversations();
                break;
            case "topic_updated":
                if (data.chatId === activeChatId && topicText) {
                    topicText.textContent = data.topic || "No topic set";
                    if (activeChatObj) activeChatObj.topic = data.topic;
                }
                break;
            case "typing":
                if (data.chatId === activeChatId && data.userId !== currentUser.id) {
                    if (data.isTyping) showTyping(data.userId, data.userName);
                    else hideTyping(data.userId);
                }
                break;
            case "message_pinned":
                if (data.chatId === activeChatId) {
                    const pm = activeMessagesList.find(m => m.id === data.messageId);
                    if (pm) { pm.pinned = data.pinned; renderMessages(); }
                }
                break;
            case "room_updated":
                loadConversations();
                break;
        }
    }

    // ── Typing Indicator ──────────────────────────
    function showTyping(userId, userName) {
        if (typingUsers[userId]) clearTimeout(typingUsers[userId].timer);
        typingUsers[userId] = {
            name: userName,
            timer: setTimeout(() => { hideTyping(userId); }, 4000)
        };
        renderTypingIndicator();
    }

    function hideTyping(userId) {
        if (typingUsers[userId]) {
            clearTimeout(typingUsers[userId].timer);
            delete typingUsers[userId];
        }
        renderTypingIndicator();
    }

    function renderTypingIndicator() {
        if (!typingIndicator) return;
        const names = Object.values(typingUsers).map(t => t.name);
        if (names.length === 0) {
            typingIndicator.style.display = "none";
            return;
        }
        typingIndicator.style.display = "flex";
        const label = names.length === 1
            ? `${esc(names[0])} is typing…`
            : names.length === 2
                ? `${esc(names[0])} and ${esc(names[1])} are typing…`
                : "Several people are typing…";
        typingIndicator.innerHTML = `
            <span class="typing-dots"><span></span><span></span><span></span></span>
            <span class="typing-label">${label}</span>
        `;
    }

    function sendTypingSignal(isTyping) {
        if (!activeChatId || !currentUser) return;
        api("/api/user-chat/typing", {
            method: "POST",
            body: JSON.stringify({ chatId: activeChatId, isTyping })
        }).catch(() => {});
    }

    // ── Conversations List ────────────────────────
    async function loadConversations() {
        if (!currentUser) return;
        try {
            const data = await api("/api/user-chat/conversations");
            if (data.success && Array.isArray(data.conversations)) {
                conversationsList = data.conversations;
                renderConversationsList();
                updateUnreadBadge();
            }
        } catch (e) {
            console.warn("[UserChat] Load conversations error:", e);
        }
    }

    function updateUnreadBadge() {
        const total = conversationsList.reduce((s, c) => s + (c.unread_count || 0), 0);
        if (globalUnreadBadge) {
            if (total > 0) {
                globalUnreadBadge.textContent = total > 99 ? "99+" : total;
                globalUnreadBadge.style.display = "inline-flex";
            } else {
                globalUnreadBadge.style.display = "none";
            }
        }
    }

    function renderConversationsList() {
        if (!chatListContainer) return;
        const list = sidebarSearchQuery
            ? conversationsList.filter(c => {
                const nameMatch = c.name && c.name.toLowerCase().includes(sidebarSearchQuery);
                const codeMatch = c.code && c.code.toLowerCase().includes(sidebarSearchQuery);
                const lastMsgMatch = c.last_message && c.last_message.content && c.last_message.content.toLowerCase().includes(sidebarSearchQuery);
                return nameMatch || codeMatch || lastMsgMatch;
            })
            : conversationsList;

        if (list.length === 0) {
            chatListContainer.innerHTML = `
                <div style="text-align:center;padding:24px 12px;color:var(--text-muted);font-size:13px;">
                    <i class="fa-regular fa-comments" style="font-size:24px;color:var(--gold);margin-bottom:8px;display:block;"></i>
                    <p>${sidebarSearchQuery ? "No conversations match your search." : "No active conversations."}</p>
                    <p style="font-size:11px;margin-top:4px;">Search a user or join a room code to start!</p>
                </div>`;
            return;
        }

        chatListContainer.innerHTML = "";
        const rooms   = list.filter(c => c.type === "room");
        const directs = list.filter(c => c.type === "direct");

        if (rooms.length > 0) {
            appendSectionTitle("Chat Rooms");
            rooms.forEach(c => chatListContainer.appendChild(makeChatItem(c)));
        }
        if (directs.length > 0) {
            appendSectionTitle("Direct Messages");
            directs.forEach(c => chatListContainer.appendChild(makeChatItem(c)));
        }
    }

    function appendSectionTitle(text) {
        const el = document.createElement("div");
        el.className = "chat-list-section-title";
        el.textContent = text;
        chatListContainer.appendChild(el);
    }

    function makeChatItem(c) {
        const item = document.createElement("div");
        item.className = `chat-list-item${c.id === activeChatId ? " active" : ""}`;

        const timeStr = c.last_message?.timestamp
            ? new Date(c.last_message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";
        const lastText = c.last_message
            ? `${c.last_message.sender_name.split(" ")[0]}: ${c.last_message.content}`
            : (c.type === "room" ? `Code: ${c.code}` : "Direct conversation");

        const onlineDot = c.target_user?.is_online
            ? `<span class="online-dot" title="Online"></span>`
            : "";

        item.innerHTML = `
            <div class="chat-item-avatar ${c.type === "room" ? "room-avatar" : ""}">
                ${c.type === "room" ? '<i class="fa-solid fa-users"></i>' : esc((c.name || "U").trim().charAt(0).toUpperCase())}
                ${onlineDot}
            </div>
            <div class="chat-item-details">
                <div class="chat-item-header">
                    <span class="chat-item-name">${esc(c.name)}</span>
                    <span class="chat-item-time">${timeStr}</span>
                </div>
                <div class="chat-item-preview">${esc(lastText.substring(0, 60))}</div>
            </div>
            ${c.unread_count > 0 ? `<span class="chat-item-badge">${c.unread_count}</span>` : ""}
        `;
        item.addEventListener("click", () => selectChat(c));
        return item;
    }

    async function selectChat(conv) {
        activeChatId = conv.id;
        activeChatObj = conv;
        typingUsers = {};
        exitMultiSelectMode();
        renderTypingIndicator();
        renderConversationsList();
        updateChatHeader(conv);

        const chatContainer = document.querySelector(".user-chat-container");
        if (chatContainer) chatContainer.classList.add("has-active-chat");

        try {
            const data = await api(`/api/user-chat/messages?chatId=${encodeURIComponent(conv.id)}`);
            if (data.success && Array.isArray(data.messages)) {
                activeMessagesList = data.messages;
                renderMessages();
                scrollToBottom();
                loadConversations();
            } else if (data.error) {
                showToast(data.error, "error");
            }
        } catch (e) {
            console.error("[UserChat] Fetch messages error:", e);
        }
    }

    function updateChatHeader(conv) {
        if (!conv) {
            if (headerName) headerName.textContent = "";
            if (headerDetails) headerDetails.textContent = "";
            if (headerAvatar) headerAvatar.innerHTML = '<i class="fa-solid fa-comments"></i>';
            if (roomCodePill) roomCodePill.style.display = "none";
            if (topicBar) topicBar.style.display = "none";
            if (deleteRoomBtn) deleteRoomBtn.style.display = "none";
            if (pinnedBtn) pinnedBtn.style.display = "none";
            return;
        }

        if (headerName) headerName.textContent = conv.name;
        if (headerAvatar) {
            headerAvatar.innerHTML = conv.type === "room"
                ? '<i class="fa-solid fa-users"></i>'
                : esc((conv.name || "U").trim().charAt(0).toUpperCase());
            headerAvatar.classList.toggle("room-avatar", conv.type === "room");
        }
        if (headerDetails) {
            headerDetails.textContent = conv.type === "room"
                ? `${conv.members_count || 1} participant(s)`
                : (conv.target_user?.is_online ? "● Online" : "Last seen recently");
            headerDetails.style.color = (conv.type === "direct" && conv.target_user?.is_online)
                ? "var(--gold)" : "";
        }

        if (roomCodePill) {
            roomCodePill.style.display = (conv.type === "room" && conv.code) ? "inline-flex" : "none";
            if (roomCodeText) roomCodeText.textContent = conv.code || "";
        }

        if (topicBar) {
            topicBar.style.display = conv.type === "room" ? "flex" : "none";
            if (topicText) topicText.textContent = conv.topic || "No topic set";
            if (editTopicBtn) editTopicBtn.style.display = conv.is_owner ? "inline-block" : "none";
        }

        if (deleteRoomBtn) deleteRoomBtn.style.display = (conv.type === "room" && conv.is_owner) ? "inline-flex" : "none";
        if (pinnedBtn) pinnedBtn.style.display = conv.type === "room" ? "inline-flex" : "none";
        if (pinnedPanel) pinnedPanel.style.display = "none";
    }

    // ── Message Rendering with Links & Code Blocks ─
    function getDateLabel(d) {
        if (!d || isNaN(d.getTime())) return "Today";
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        if (d.toDateString() === today.toDateString()) return "Today";
        if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
        return d.toLocaleDateString([], {
            month: "short",
            day: "numeric",
            year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined
        });
    }

    // ── Message Rendering with Links & Code Blocks ─
    function renderMessages() {
        if (!messagesArea) return;
        const query = (searchInput?.value || "").trim().toLowerCase();
        const list  = query
            ? activeMessagesList.filter(m => m.content && m.content.toLowerCase().includes(query))
            : activeMessagesList;

        if (list.length === 0) {
            renderEmptyState(query ? "No messages match your search." : "No messages yet. Say hello!");
            return;
        }

        window.clearMathTypesetting?.(messagesArea);
        messagesArea.innerHTML = "";
        let lastDateStr = null;

        list.forEach(msg => {
            const msgDate = new Date(msg.created_at || msg.timestamp);
            const dateKey = !isNaN(msgDate.getTime()) ? msgDate.toDateString() : null;
            if (dateKey && dateKey !== lastDateStr) {
                lastDateStr = dateKey;
                const sep = document.createElement("div");
                sep.className = "chat-date-separator";
                sep.innerHTML = `<span>${getDateLabel(msgDate)}</span>`;
                messagesArea.appendChild(sep);
            }
            appendMessage(msg);
        });
    }

    function renderEmptyState(msg) {
        if (!messagesArea) return;
        window.clearMathTypesetting?.(messagesArea);
        messagesArea.innerHTML = `
            <div class="chat-empty-state">
                <div class="chat-empty-state-icon">
                    <i class="fa-solid fa-comments"></i>
                </div>
                <h2>PIXEL CHAT</h2>
                <p>${esc(msg || "Start a new conversation or select an existing one to chat.")}</p>
                ${!activeChatId ? `<button id="emptyStateNewChatBtn" class="chat-action-btn primary" type="button"><i class="fa-solid fa-plus"></i> New Chat</button>` : ""}
            </div>`;
        document.getElementById("emptyStateNewChatBtn")?.addEventListener("click", () => {
            document.getElementById("startDirectChatBtn")?.click();
        });
    }

    function formatMessageContent(content) {
        if (!content) return "";
        if (typeof window.formatMessage === "function") {
            try {
                return window.formatMessage(content);
            } catch (_) {}
        }
        let html = esc(content);
        if (window.markdownit) {
            try {
                const md = window.markdownit({ html: false, linkify: true, breaks: true });
                html = md.render(content);
            } catch (_) {}
        } else {
            html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:var(--gold);text-decoration:underline;">$1</a>');
        }
        return html;
    }

    // ── Reply & Edit Previews in Composer ─────────
    function setReplyTo(msg) {
        if (editingMessage) cancelEditMessage();
        replyingTo = msg;
        if (replyBar && replyBarText) {
            replyBar.style.display = "flex";
            const icon = document.getElementById("userChatReplyBarIcon");
            if (icon) icon.className = "fa-solid fa-reply";
            replyBarText.textContent = `Replying to ${msg.sender_name || "User"}: ${(msg.content || "").substring(0, 50)}`;
        }
        messageInput?.focus();
    }

    function clearReplyTo() {
        if (editingMessage) {
            cancelEditMessage();
            return;
        }
        replyingTo = null;
        if (replyBar) replyBar.style.display = "none";
        if (replyBarText) replyBarText.textContent = "";
    }

    function doEditMessage(msg) {
        if (replyingTo) clearReplyTo();
        editingMessage = msg;
        if (replyBar && replyBarText) {
            replyBar.style.display = "flex";
            const icon = document.getElementById("userChatReplyBarIcon");
            if (icon) icon.className = "fa-solid fa-pen";
            replyBarText.textContent = `Editing: ${(msg.content || "").substring(0, 50)}`;
        }
        if (messageInput) {
            messageInput.value = msg.content || "";
            messageInput.focus();
            messageInput.style.height = "auto";
            messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
        }
    }

    function cancelEditMessage() {
        editingMessage = null;
        if (replyBar) replyBar.style.display = "none";
        const icon = document.getElementById("userChatReplyBarIcon");
        if (icon) icon.className = "fa-solid fa-reply";
        if (messageInput) {
            messageInput.value = "";
            messageInput.style.height = "auto";
        }
    }

    // ── Floating Action Context Menu ──────────────
    function openMessageActionMenu(e, msg, isMine) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        closeMessageActionMenu();

        const menu = document.createElement("div");
        menu.className = "msg-action-menu";
        menu.id = "activeMsgActionMenu";

        const isOwner = Boolean(activeChatObj?.is_owner);

        menu.innerHTML = `
            <div style="display:flex; gap:4px; padding:2px 4px 6px; border-bottom:1px solid rgba(255,255,255,0.08); margin-bottom:4px; overflow-x:auto;">
                ${REACTION_EMOJIS.slice(0, 6).map(em => `<button class="msg-hover-btn reaction-menu-trigger" data-emoji="${em}" style="font-size:16px; padding:3px 5px;" title="${em}">${em}</button>`).join("")}
            </div>
            <button class="msg-action-menu-item action-reply"><i class="fa-solid fa-reply"></i> Reply</button>
            <button class="msg-action-menu-item action-copy"><i class="fa-solid fa-copy"></i> Copy text</button>
            <button class="msg-action-menu-item action-forward"><i class="fa-solid fa-share"></i> Forward</button>
            ${isMine ? `<button class="msg-action-menu-item action-edit"><i class="fa-solid fa-pen"></i> Edit</button>` : ""}
            ${isOwner ? `<button class="msg-action-menu-item action-pin"><i class="fa-solid fa-thumbtack"></i> ${msg.pinned ? "Unpin" : "Pin"}</button>` : ""}
            <button class="msg-action-menu-item action-select"><i class="fa-solid fa-square-check"></i> Select</button>
            ${(isMine || isOwner) ? `<div class="msg-action-menu-divider"></div><button class="msg-action-menu-item danger action-delete"><i class="fa-solid fa-trash"></i> Delete</button>` : ""}
        `;

        document.body.appendChild(menu);

        menu.querySelectorAll(".reaction-menu-trigger").forEach(btn => {
            btn.addEventListener("click", () => {
                closeMessageActionMenu();
                doReaction(msg.id, btn.dataset.emoji);
            });
        });
        menu.querySelector(".action-reply")?.addEventListener("click", () => { closeMessageActionMenu(); setReplyTo(msg); });
        menu.querySelector(".action-copy")?.addEventListener("click", () => { closeMessageActionMenu(); copyMessageText(msg.content); });
        menu.querySelector(".action-forward")?.addEventListener("click", () => { closeMessageActionMenu(); openForwardModal(msg); });
        menu.querySelector(".action-edit")?.addEventListener("click", () => { closeMessageActionMenu(); doEditMessage(msg); });
        menu.querySelector(".action-pin")?.addEventListener("click", () => { closeMessageActionMenu(); doPinMessage(msg.id); });
        menu.querySelector(".action-select")?.addEventListener("click", () => { closeMessageActionMenu(); enterMultiSelectMode(msg.id); });
        menu.querySelector(".action-delete")?.addEventListener("click", () => { closeMessageActionMenu(); doDeleteMessage(msg.id); });

        const menuWidth = 180;
        const menuHeight = 260;
        let posX = (e && e.clientX) ? e.clientX : window.innerWidth / 2;
        let posY = (e && e.clientY) ? e.clientY : window.innerHeight / 2;

        if (posX + menuWidth > window.innerWidth - 16) posX = window.innerWidth - menuWidth - 16;
        if (posY + menuHeight > window.innerHeight - 16) posY = window.innerHeight - menuHeight - 16;
        if (posX < 16) posX = 16;
        if (posY < 16) posY = 16;

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;

        setTimeout(() => {
            const outsideClose = (ev) => {
                if (!menu.contains(ev.target)) {
                    closeMessageActionMenu();
                    document.removeEventListener("click", outsideClose);
                    document.removeEventListener("keydown", escapeClose);
                }
            };
            const escapeClose = (ev) => {
                if (ev.key === "Escape") {
                    closeMessageActionMenu();
                    document.removeEventListener("click", outsideClose);
                    document.removeEventListener("keydown", escapeClose);
                }
            };
            document.addEventListener("click", outsideClose);
            document.addEventListener("keydown", escapeClose);
        }, 10);
    }

    function closeMessageActionMenu() {
        const existing = document.getElementById("activeMsgActionMenu");
        if (existing) existing.remove();
    }

    function appendMessage(msg) {
        if (!messagesArea) return;

        if (msg.sender_id === "system") {
            const el = document.createElement("div");
            el.className = "system-msg-row";
            el.textContent = msg.content;
            messagesArea.appendChild(el);
            return;
        }

        const isMine = msg.sender_id === currentUser.id;
        const isSendingTemp = msg.id.startsWith("temp_");
        const timeStr = new Date(msg.created_at || msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const formattedContent = formatMessageContent(msg.content);

        let attachHtml = "";
        if (Array.isArray(msg.attachments) && msg.attachments.length > 0) {
            attachHtml = `<div class="chat-msg-attachments-wrap">`;
            msg.attachments.forEach((a, attachmentIndex) => {
                if (a.type && a.type.startsWith("image/")) {
                    const directUrl = typeof a.url === "string" && a.url.startsWith("data:") ? a.url : "";
                    attachHtml += `<img class="chat-msg-img-attachment" src="${esc(directUrl)}" data-attachment-index="${attachmentIndex}" alt="${esc(a.name || "Image attachment")}"/>`;
                } else {
                    attachHtml += `<a class="chat-msg-file-attachment" href="#" target="_blank" rel="noopener noreferrer" aria-disabled="true" data-attachment-index="${attachmentIndex}" download="${esc(a.name)}"><i class="fa-solid fa-paperclip"></i> ${esc(a.name || "Attachment")}</a>`;
                }
            });
            attachHtml += `</div>`;
        }

        let reactHtml = "";
        if (msg.reactions && Object.keys(msg.reactions).length > 0) {
            reactHtml = `<div class="msg-reactions-row">`;
            Object.entries(msg.reactions).forEach(([emoji, uids]) => {
                if (uids.length > 0) {
                    const mine = uids.includes(currentUser.id);
                    reactHtml += `<span class="reaction-pill${mine ? " active" : ""}" data-emoji="${esc(emoji)}" title="${uids.length} reaction${uids.length > 1 ? "s" : ""}">${emoji} ${uids.length}</span>`;
                }
            });
            reactHtml += `</div>`;
        }

        let replyHtml = "";
        if (msg.reply_to) {
            const parent = activeMessagesList.find(m => m.id === msg.reply_to);
            if (parent) {
                replyHtml = `<div class="chat-reply-preview" data-reply-id="${esc(parent.id)}">
                    <span class="chat-reply-preview-author">${esc(parent.sender_name)}</span>
                    <span class="chat-reply-preview-text">${esc((parent.content || "").substring(0, 60))}</span>
                </div>`;
            }
        }

        const pinIcon = msg.pinned ? `<i class="fa-solid fa-thumbtack pin-icon" title="Pinned"></i>` : "";
        
        // Read / Seen Status Checkmark
        const isRead = Array.isArray(msg.read_by) && msg.read_by.length > 1;
        const statusIcon = isMine
            ? (isSendingTemp
                ? `<i class="fa-solid fa-clock status-check" style="font-size:10px;margin-left:4px;color:var(--text-muted);" title="Sending..."></i>`
                : (isRead
                    ? `<i class="fa-solid fa-check-double status-check" style="font-size:10px;margin-left:4px;color:var(--gold);" title="Seen"></i>`
                    : `<i class="fa-solid fa-check status-check" style="font-size:10px;margin-left:4px;color:var(--text-muted);" title="Sent"></i>`))
            : "";

        const checkboxHtml = isMultiSelectMode
            ? `<input type="checkbox" class="chat-msg-checkbox" data-msg-id="${esc(msg.id)}" ${selectedMsgIds.has(msg.id) ? "checked" : ""}/>`
            : "";

        const row = document.createElement("div");
        row.className = `chat-msg-row${isMine ? " mine" : ""}${msg.is_deleted ? " deleted" : ""}${isSendingTemp ? " sending" : ""}`;
        row.dataset.msgId = msg.id;

        row.innerHTML = `
            ${checkboxHtml}
            <div class="chat-msg-avatar">${esc(msg.sender_avatar || "P")}</div>
            <div class="chat-msg-content-wrap">
                <span class="chat-msg-sender">
                    ${esc(msg.sender_name)}
                    ${msg.is_edited ? `<small style="color:var(--text-muted);">(edited)</small>` : ""}
                    ${pinIcon}
                </span>
                ${replyHtml}
                <div class="chat-msg-bubble${msg.is_deleted ? " is-deleted" : ""}">
                    ${msg.is_deleted ? '<em style="color:var(--text-muted);">This message was deleted.</em>' : formattedContent + attachHtml}
                    <span class="msg-inline-time">${timeStr} ${statusIcon}</span>
                </div>
                ${reactHtml}
            </div>

            ${(!msg.is_deleted && !isSendingTemp && !isMultiSelectMode) ? `<div class="msg-hover-actions">
                ${REACTION_EMOJIS.slice(0, 4).map(e => `<button class="msg-hover-btn reaction-trigger" data-emoji="${e}" title="${e}">${e}</button>`).join("")}
                <button class="msg-hover-btn reply-btn" title="Reply"><i class="fa-solid fa-reply"></i></button>
                <button class="msg-hover-btn msg-more-btn" title="More options"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>` : ""}
        `;

        row.querySelectorAll(".reaction-trigger, .reaction-pill").forEach(btn => {
            btn.addEventListener("click", () => {
                const emoji = btn.dataset.emoji;
                if (emoji) doReaction(msg.id, emoji);
            });
        });

        row.querySelector(".reply-btn")?.addEventListener("click", () => setReplyTo(msg));
        row.querySelector(".msg-more-btn")?.addEventListener("click", (e) => openMessageActionMenu(e, msg, isMine));

        const bubble = row.querySelector(".chat-msg-bubble");
        if (bubble) {
            bubble.addEventListener("contextmenu", (e) => openMessageActionMenu(e, msg, isMine));
            // Mobile touch tap trigger
            let touchTimer = null;
            bubble.addEventListener("touchstart", (e) => {
                touchTimer = setTimeout(() => openMessageActionMenu(e.touches[0] || e, msg, isMine), 500);
            }, { passive: true });
            bubble.addEventListener("touchend", () => clearTimeout(touchTimer));
        }

        const chk = row.querySelector(".chat-msg-checkbox");
        if (chk) {
            chk.addEventListener("change", e => {
                if (e.target.checked) selectedMsgIds.add(msg.id);
                else selectedMsgIds.delete(msg.id);
                updateMultiSelectBar();
            });
        }

        row.querySelector(".chat-reply-preview")?.addEventListener("click", () => {
            const parentEl = messagesArea.querySelector(`[data-msg-id="${row.querySelector(".chat-reply-preview").dataset.replyId}"]`);
            if (parentEl) {
                parentEl.scrollIntoView({ behavior: "smooth", block: "center" });
                parentEl.classList.remove("highlight-reply");
                void parentEl.offsetWidth;
                parentEl.classList.add("highlight-reply");
                setTimeout(() => parentEl.classList.remove("highlight-reply"), 2000);
            }
        });

        messagesArea.appendChild(row);
        window.typesetMath?.(row.querySelector(".chat-msg-bubble"));
        row.querySelectorAll(".chat-msg-img-attachment").forEach((img, index) => {
            const attachment = msg.attachments[Number(img.dataset.attachmentIndex)] || msg.attachments[index];
            img.addEventListener("click", () => {
                if (!img.getAttribute("src")) return;
                if (window.openArtworkViewer) window.openArtworkViewer(img.src, attachment?.name || "Image attachment");
                else window.open(img.src, "_blank", "noopener");
            });
            if (img.getAttribute("src")) return;
            const path = attachment?.path;
            if (!path) {
                img.alt = "Image unavailable";
                return;
            }
            const cacheKey = `${msg.chat_id}:${path}`;
            let signedUrl = attachmentUrlCache.get(cacheKey);
            if (!signedUrl) {
                signedUrl = api(`/api/user-chat/attachment-url?chatId=${encodeURIComponent(msg.chat_id)}&path=${encodeURIComponent(path)}`)
                    .then(data => {
                    if (!data.success || !data.signedUrl) throw new Error(data.error || "Unable to load image");
                    return data.signedUrl;
                });
                attachmentUrlCache.set(cacheKey, signedUrl);
            }
            Promise.resolve(signedUrl).then(url => {
                attachmentUrlCache.set(cacheKey, url);
                if (img.isConnected) img.src = url;
            }).catch(() => {
                attachmentUrlCache.delete(cacheKey);
                if (img.isConnected) img.alt = "Image unavailable";
            });
        });
        row.querySelectorAll(".chat-msg-file-attachment").forEach(link => {
            const attachment = msg.attachments[Number(link.dataset.attachmentIndex)];
            const type = typeof attachment?.type === "string" ? attachment.type.toLowerCase() : "";
            link.addEventListener("click", event => {
                if (link.getAttribute("aria-disabled") === "true") event.preventDefault();
            });
            const dataUrl = typeof attachment?.url === "string" &&
                SAFE_ATTACHMENT_TYPES.has(type) &&
                attachment.url.startsWith(`data:${type};base64,`) &&
                attachment.url.length <= 7 * 1024 * 1024
                ? attachment.url
                : "";
            const path = typeof attachment?.path === "string" && attachment.path.length <= 512
                ? attachment.path
                : "";

            const enableLink = url => {
                if (!link.isConnected || !/^https:\/\//i.test(url)) return;
                link.href = url;
                link.removeAttribute("aria-disabled");
            };

            if (dataUrl) {
                link.href = dataUrl;
                link.removeAttribute("aria-disabled");
                return;
            }
            if (!path) return;

            const cacheKey = `${msg.chat_id}:${path}`;
            let signedUrl = attachmentUrlCache.get(cacheKey);
            if (!signedUrl) {
                signedUrl = api(`/api/user-chat/attachment-url?chatId=${encodeURIComponent(msg.chat_id)}&path=${encodeURIComponent(path)}`)
                    .then(data => {
                        if (!data.success || !data.signedUrl) throw new Error(data.error || "Unable to load attachment");
                        return data.signedUrl;
                    });
                attachmentUrlCache.set(cacheKey, signedUrl);
            }
            Promise.resolve(signedUrl).then(url => {
                attachmentUrlCache.set(cacheKey, url);
                enableLink(url);
            }).catch(() => attachmentUrlCache.delete(cacheKey));
        });
    }

    // ── Smart Scroll-To-Bottom ────────────────────
    function isUserNearBottom() {
        if (!messagesArea) return true;
        return (messagesArea.scrollHeight - messagesArea.scrollTop - messagesArea.clientHeight) < 160;
    }

    function smartScrollToBottom(force = false) {
        if (!messagesArea) return;
        const scrollBtn = document.getElementById("userChatScrollBottomBtn");
        const counterBadge = document.getElementById("userChatNewMsgCounter");

        if (force || isUserNearBottom()) {
            messagesArea.scrollTop = messagesArea.scrollHeight;
            unreadNewMessagesCount = 0;
            if (scrollBtn) scrollBtn.style.display = "none";
        } else {
            unreadNewMessagesCount++;
            if (scrollBtn) {
                scrollBtn.style.display = "flex";
                if (counterBadge) {
                    counterBadge.textContent = `${unreadNewMessagesCount} new`;
                    counterBadge.style.display = "inline";
                }
            }
        }
    }

    function scrollToBottom() {
        smartScrollToBottom(true);
    }

    // ── Copy Message Text ─────────────────────────
    function copyMessageText(text) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copied to clipboard!", "success");
        }).catch(() => {
            showToast("Failed to copy text.", "error");
        });
    }

    // ── Forward Message ───────────────────────────
    function openForwardModal(msg) {
        forwardingMessage = msg;
        if (!forwardModal || !forwardTargetList) return;
        forwardTargetList.innerHTML = "";

        conversationsList.forEach(c => {
            if (c.id === activeChatId) return;
            const item = document.createElement("div");
            item.className = "chat-list-item";
            item.style.cursor = "pointer";
            item.innerHTML = `
                <div class="chat-item-avatar ${c.type === "room" ? "room-avatar" : ""}">
                    ${c.type === "room" ? '<i class="fa-solid fa-users"></i>' : esc((c.name || "U").trim().charAt(0).toUpperCase())}
                </div>
                <div class="chat-item-details">
                    <span class="chat-item-name">${esc(c.name)}</span>
                    <span class="chat-item-preview">${c.type === "room" ? "Room" : "Direct Message"}</span>
                </div>
                <button class="chat-action-btn primary" style="font-size:11px;padding:4px 10px;">Send</button>
            `;
            item.querySelector("button").addEventListener("click", async () => {
                forwardModal.close();
                await doForwardMessageTo(c.id, msg);
            });
            forwardTargetList.appendChild(item);
        });

        forwardModal.showModal();
    }

    async function doForwardMessageTo(targetChatId, msg) {
        try {
            const data = await api("/api/user-chat/send", {
                method: "POST",
                body: JSON.stringify({
                    chatId: targetChatId,
                    content: `[Forwarded]: ${msg.content}`,
                    attachments: msg.attachments || []
                })
            });
            if (data.success) {
                showToast("Message forwarded successfully!", "success");
            } else {
                showToast(data.error || "Failed to forward message.", "error");
            }
        } catch (e) { console.error(e); }
    }

    // ── Multi-Select Batch Operations ─────────────
    function enterMultiSelectMode(initialMsgId) {
        isMultiSelectMode = true;
        selectedMsgIds.clear();
        if (initialMsgId) selectedMsgIds.add(initialMsgId);
        if (multiSelectBar) multiSelectBar.style.display = "flex";
        updateMultiSelectBar();
        renderMessages();
    }

    function exitMultiSelectMode() {
        isMultiSelectMode = false;
        selectedMsgIds.clear();
        if (multiSelectBar) multiSelectBar.style.display = "none";
        renderMessages();
    }

    function updateMultiSelectBar() {
        if (multiSelectCount) multiSelectCount.textContent = `${selectedMsgIds.size} message(s) selected`;
    }

    async function handleBatchCopy() {
        const selected = activeMessagesList.filter(m => selectedMsgIds.has(m.id));
        const fullText = selected.map(m => `${m.sender_name}: ${m.content}`).join("\n");
        copyMessageText(fullText);
        exitMultiSelectMode();
    }

    async function handleBatchDelete() {
        if (selectedMsgIds.size === 0) return;
        if (!confirm(`Delete ${selectedMsgIds.size} selected message(s)?`)) return;

        for (const msgId of Array.from(selectedMsgIds)) {
            await doDeleteMessage(msgId);
        }
        exitMultiSelectMode();
    }

    // ── Instant Optimistic Send Message ───────────
    async function sendMessage() {
        if (!activeChatId) {
            showToast("Please select a conversation first.", "info");
            return;
        }

        if (!messageInput) return;
        const text = messageInput.value.trim();

        if (!text && pendingAttachments.length === 0) {
            showToast("Message cannot be empty.", "info");
            return;
        }

        // Check if editing existing message
        if (editingMessage) {
            const editId = editingMessage.id;
            const newContent = text;
            cancelEditMessage();
            try {
                const data = await api("/api/user-chat/edit", {
                    method: "POST",
                    body: JSON.stringify({ chatId: activeChatId, messageId: editId, newContent })
                });
                if (data.success && data.message) {
                    const idx = activeMessagesList.findIndex(m => m.id === editId);
                    if (idx > -1) {
                        activeMessagesList[idx] = data.message;
                        renderMessages();
                    }
                } else if (data.error) {
                    showToast(data.error, "error");
                }
            } catch (e) {
                console.error(e);
                showToast("Failed to edit message.", "error");
            }
            return;
        }

        if (pendingAttachments.some(attachment => attachment.uploading)) {
            showToast("Please wait for image uploads to finish.", "info");
            return;
        }
        const atts = pendingAttachments.map(({ name, type, url, path, size }) => ({ name, type, url, path, size }));
        const replyTo = replyingTo?.id || null;

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const tempMsg = {
            id: tempId,
            chat_id: activeChatId,
            sender_id: currentUser.id,
            sender_name: currentUser.display_name,
            sender_avatar: (currentUser.display_name || "P").charAt(0).toUpperCase(),
            content: text,
            attachments: atts,
            reactions: {},
            is_edited: false,
            is_deleted: false,
            read_by: [currentUser.id],
            reply_to: replyTo,
            pinned: false,
            created_at: new Date().toISOString(),
            timestamp: new Date().toISOString()
        };

        activeMessagesList.push(tempMsg);
        renderMessages();
        smartScrollToBottom(true);

        messageInput.value = "";
        messageInput.style.height = "auto";
        pendingAttachments = [];
        renderAttachmentsPreview();
        clearReplyTo();

        if (isCurrentlyTyping) {
            isCurrentlyTyping = false;
            sendTypingSignal(false);
        }

        try {
            const data = await api("/api/user-chat/send", {
                method: "POST",
                body: JSON.stringify({
                    chatId: activeChatId,
                    content: text,
                    attachments: atts,
                    replyTo
                })
            });

            if (data.success && data.message) {
                const tempIdx = activeMessagesList.findIndex(m => m.id === tempId);
                if (tempIdx > -1) {
                    activeMessagesList[tempIdx] = data.message;
                    renderMessages();
                }
                loadConversations();
            } else {
                activeMessagesList = activeMessagesList.filter(m => m.id !== tempId);
                renderMessages();
                showToast(data.error || "Failed to send message.", "error");
            }
        } catch (e) {
            console.error("[UserChat] Background send error:", e);
            activeMessagesList = activeMessagesList.filter(m => m.id !== tempId);
            renderMessages();
            showToast("Network error sending message.", "error");
        }
    }

    // ── Reactions ─────────────────────────────────
    async function doReaction(messageId, emoji) {
        if (!activeChatId) return;
        try {
            const data = await api("/api/user-chat/react", {
                method: "POST",
                body: JSON.stringify({ chatId: activeChatId, messageId, emoji })
            });
            if (data.success) {
                const msg = activeMessagesList.find(m => m.id === messageId);
                if (msg) { msg.reactions = data.reactions; renderMessages(); }
            }
        } catch (e) { console.error(e); }
    }

    // ── Delete Message ────────────────────────────
    async function doDeleteMessage(messageId) {
        try {
            const data = await api("/api/user-chat/delete-message", {
                method: "POST",
                body: JSON.stringify({ chatId: activeChatId, messageId })
            });
            if (data.success) {
                const msg = activeMessagesList.find(m => m.id === messageId);
                if (msg) { msg.is_deleted = true; msg.content = ""; renderMessages(); }
            } else if (data.error) {
                showToast(data.error, "error");
            }
        } catch (e) { console.error(e); }
    }

    // ── Pin Message ───────────────────────────────
    async function doPinMessage(messageId) {
        try {
            const data = await api("/api/user-chat/pin", {
                method: "POST",
                body: JSON.stringify({ chatId: activeChatId, messageId })
            });
            if (data.success) {
                const msg = activeMessagesList.find(m => m.id === messageId);
                if (msg) { msg.pinned = data.pinned; renderMessages(); }
            } else if (data.error) {
                showToast(data.error, "error");
            }
        } catch (e) { console.error(e); }
    }

    // ── Pinned Messages Panel ─────────────────────
    async function togglePinnedPanel() {
        if (!pinnedPanel) return;
        const isOpen = pinnedPanel.style.display !== "none";
        pinnedPanel.style.display = isOpen ? "none" : "block";
        if (!isOpen) await loadPinnedMessages();
    }

    async function loadPinnedMessages() {
        if (!pinnedList || !activeChatId) return;
        pinnedList.innerHTML = `<p style="padding:12px;color:var(--text-muted);">Loading pinned messages…</p>`;
        try {
            const data = await api(`/api/user-chat/pinned?chatId=${encodeURIComponent(activeChatId)}`);
            if (data.success && Array.isArray(data.messages)) {
                if (data.messages.length === 0) {
                    pinnedList.innerHTML = `<p style="padding:12px;color:var(--text-muted);">No pinned messages.</p>`;
                    return;
                }
                pinnedList.innerHTML = "";
                data.messages.forEach(m => {
                    const el = document.createElement("div");
                    el.className = "chat-list-item";
                    el.style.cursor = "pointer";
                    el.innerHTML = `
                        <div class="chat-item-avatar">${esc(m.sender_avatar || "P")}</div>
                        <div class="chat-item-details">
                            <span class="chat-item-name">${esc(m.sender_name)}</span>
                            <span class="chat-item-preview">${esc((m.content || "").substring(0, 80))}</span>
                        </div>
                    `;
                    el.addEventListener("click", () => {
                        const target = messagesArea?.querySelector(`[data-msg-id="${m.id}"]`);
                        if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
                        if (pinnedPanel) pinnedPanel.style.display = "none";
                    });
                    pinnedList.appendChild(el);
                });
            }
        } catch (e) { console.error(e); }
    }

    // ── File Attachments & Drag and Drop ──────────
    async function handleFileSelection(files) {
        if (!files || files.length === 0 || !activeChatId) return;

        for (const file of Array.from(files)) {
            const type = file.type || (/\.(jpe?g|png|gif|webp)$/i.test(file.name) ? `image/${file.name.split(".").pop().toLowerCase().replace("jpg", "jpeg")}` : "application/octet-stream");
            if (!SAFE_ATTACHMENT_TYPES.has(type.toLowerCase())) {
                showToast("This file type is not supported in shared chats.", "error");
                continue;
            }
            if (typeof file.name !== "string" || file.name.length > 180) {
                showToast("The file name is too long.", "error");
                continue;
            }
            const nextTotal = pendingAttachments.reduce((sum, item) => sum + (item.size || 0), 0) + file.size;
            if (!Number.isInteger(file.size) || file.size < 1 || file.size > 5 * 1024 * 1024 || nextTotal > 5 * 1024 * 1024) {
                showToast("Shared-chat attachments are limited to 5 MB total.", "error");
                continue;
            }
            if (pendingAttachments.length >= 4) {
                showToast("You can attach up to 4 files per message.", "error");
                break;
            }
            const attachment = {
                name: file.name,
                type,
                url: type.startsWith("image/") ? URL.createObjectURL(file) : "",
                size: file.size,
                uploading: true
            };
            pendingAttachments.push(attachment);
            renderAttachmentsPreview();
            try {
                const urlData = await api("/api/user-chat/upload-url", {
                    method: "POST",
                    body: JSON.stringify({ fileName: file.name, contentType: type, fileSize: file.size, chatId: activeChatId })
                });

                if (!urlData.success) throw new Error(urlData.error || "Failed to get upload URL");

                const uploadRes = await fetch(urlData.signedUrl, {
                    method: "PUT",
                    headers: { "Content-Type": type },
                    body: file
                });

                if (!uploadRes.ok) throw new Error("Upload failed: " + uploadRes.status);

                attachment.path = urlData.path;
                attachment.uploading = false;
                if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
                attachment.url = "";
                renderAttachmentsPreview();
            } catch (err) {
                console.warn("[UserChat] File upload error:", err);
                if (file.size < 5 * 1024 * 1024) {
                    const reader = new FileReader();
                    reader.onload = e => {
                        if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
                        attachment.url = e.target.result;
                        attachment.uploading = false;
                        renderAttachmentsPreview();
                    };
                    reader.readAsDataURL(file);
                } else {
                    if (attachment.url.startsWith("blob:")) URL.revokeObjectURL(attachment.url);
                    pendingAttachments = pendingAttachments.filter(item => item !== attachment);
                    renderAttachmentsPreview();
                    showToast(`File too large to upload: ${file.name}`, "error");
                }
            }
        }
    }

    function renderAttachmentsPreview() {
        if (!attachmentsPreview) return;
        if (pendingAttachments.length === 0) {
            attachmentsPreview.style.display = "none";
            attachmentsPreview.innerHTML = "";
            return;
        }
        attachmentsPreview.style.display = "flex";
        attachmentsPreview.innerHTML = "";
        pendingAttachments.forEach((a, idx) => {
            const pill = document.createElement("div");
            pill.className = "reaction-pill user-chat-attachment-preview";
            pill.style.cursor = "default";
            pill.innerHTML = `${a.type?.startsWith("image/") && a.url ? `<img src="${esc(a.url)}" alt="" class="user-chat-attachment-thumb">` : `<i class="fa-solid fa-paperclip"></i>`}<span>${esc(a.name)}${a.uploading ? " · Uploading" : ""}</span><button class="remove-att" data-idx="${idx}" type="button" aria-label="Remove attachment"><i class="fa-solid fa-xmark"></i></button>`;
            pill.querySelector(".remove-att").addEventListener("click", () => {
                const [removed] = pendingAttachments.splice(idx, 1);
                if (removed?.url?.startsWith("blob:")) URL.revokeObjectURL(removed.url);
                renderAttachmentsPreview();
            });
            attachmentsPreview.appendChild(pill);
        });
    }

    // ── Room Actions ──────────────────────────────
    async function handleEditTopic() {
        if (!activeChatObj || activeChatObj.type !== "room") return;
        const newTopic = prompt("Update Room Topic:", activeChatObj.topic || "");
        if (newTopic === null) return;
        try {
            const data = await api("/api/user-chat/rooms/topic", {
                method: "POST",
                body: JSON.stringify({ roomCode: activeChatObj.code, topic: newTopic })
            });
            if (data.success && data.room) {
                activeChatObj.topic = data.room.topic;
                if (topicText) topicText.textContent = data.room.topic || "No topic set";
            }
        } catch (e) { console.error(e); }
    }

    async function handleClearHistory() {
        if (!activeChatId) return;
        if (!confirm("Clear all messages in this chat? This cannot be undone.")) return;
        try {
            const data = await api("/api/user-chat/clear-history", {
                method: "POST",
                body: JSON.stringify({ chatId: activeChatId })
            });
            if (data.success) {
                activeMessagesList = [];
                renderEmptyState("Chat history cleared.");
            }
        } catch (e) { console.error(e); }
    }

    async function handleDeleteRoom() {
        if (!activeChatObj || activeChatObj.type !== "room") return;
        if (!confirm(`Delete room "${activeChatObj.name}" (${activeChatObj.code})? All participants will be disconnected.`)) return;
        try {
            const data = await api("/api/user-chat/rooms/delete", {
                method: "POST",
                body: JSON.stringify({ roomCode: activeChatObj.code })
            });
            if (data.success) {
                activeChatId = null;
                activeChatObj = null;
                updateChatHeader(null);
                renderEmptyState("Room deleted.");
                await loadConversations();
            }
        } catch (e) { console.error(e); }
    }

    // ── User Search & Direct Chat ─────────────────
    function openSearchUserModal() {
        if (!currentUser) initUserIdentity();
        if (!searchUserModal) return;
        searchUserModal.showModal();
        performUserSearch("");
    }

    async function performUserSearch(query) {
        const results = document.getElementById("userSearchResults");
        if (!results) return;
        results.innerHTML = `<p style="padding:12px;text-align:center;color:var(--text-muted);">Searching…</p>`;
        try {
            const data = await api(`/api/user-chat/users?q=${encodeURIComponent(query)}`);
            if (data.success && Array.isArray(data.users)) {
                if (data.users.length === 0) {
                    results.innerHTML = `<p style="text-align:center;color:var(--text-muted);padding:16px;">No users found.</p>`;
                    return;
                }
                results.innerHTML = "";
                data.users.forEach(u => {
                    const row = document.createElement("div");
                    row.className = "chat-list-item";
                    const onlineDot = u.is_online ? `<span class="online-dot" title="Online"></span>` : "";
                    row.innerHTML = `
                        <div class="chat-item-avatar" style="position:relative;">
                            ${esc((u.avatar || u.display_name || "P").charAt(0).toUpperCase())}
                            ${onlineDot}
                        </div>
                        <div class="chat-item-details">
                            <span class="chat-item-name">${esc(u.display_name)} ${u.is_online ? '<span style="color:var(--gold);font-size:10px;">● online</span>' : ''}</span>
                            <span class="chat-item-preview">${esc(u.email)}</span>
                        </div>
                        <button class="chat-action-btn primary" type="button"><i class="fa-solid fa-paper-plane"></i> Chat</button>
                    `;
                    row.querySelector("button").addEventListener("click", () => {
                        searchUserModal.close();
                        startDirectChat(u.id);
                    });
                    results.appendChild(row);
                });
            }
        } catch (e) { console.warn(e); }
    }

    async function startDirectChat(targetUserId) {
        try {
            const data = await api("/api/user-chat/direct", {
                method: "POST",
                body: JSON.stringify({ targetUserId })
            });
            if (data.success && data.conversation) {
                await loadConversations();
                selectChat(data.conversation);
            } else if (data.error) {
                showToast(data.error, "error");
            }
        } catch (e) { console.error(e); }
    }

    // ── Room Modals ───────────────────────────────
    function openCreateRoomModal() {
        if (!currentUser) initUserIdentity();
        if (!createRoomModal) return;
        const inp = document.getElementById("createRoomNameInput");
        if (inp) inp.value = "";
        createRoomModal.showModal();
        setTimeout(() => inp?.focus(), 50);
    }

    async function handleCreateRoom() {
        if (!currentUser) initUserIdentity();
        const inp = document.getElementById("createRoomNameInput");
        const btn = document.getElementById("confirmCreateRoomBtn");
        const name = inp?.value.trim() || "Pixel Crew";

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating...';
        }

        try {
            const data = await api("/api/user-chat/rooms/create", {
                method: "POST",
                body: JSON.stringify({ roomName: name })
            });

            if (data.success && data.room) {
                createRoomModal.close();
                await loadConversations();
                selectChat(data.room);
                showToast(`Room created! Code: ${data.room.code} — Share it with friends!`, "success");
            } else {
                showToast(data.error || "Failed to create room.", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Network error creating room.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = "Create Room";
            }
        }
    }

    function openJoinRoomModal() {
        if (!currentUser) initUserIdentity();
        if (!joinRoomModal) return;
        const inp = document.getElementById("joinRoomCodeInput");
        if (inp) inp.value = "";
        joinRoomModal.showModal();
        setTimeout(() => inp?.focus(), 50);
    }

    async function handleJoinRoom() {
        if (!currentUser) initUserIdentity();
        const inp = document.getElementById("joinRoomCodeInput");
        const btn = document.getElementById("confirmJoinRoomBtn");
        const code = inp?.value.trim();

        if (!code) {
            showToast("Please enter a room code.", "info");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Joining...';
        }

        try {
            const data = await api("/api/user-chat/rooms/join", {
                method: "POST",
                body: JSON.stringify({ roomCode: code })
            });

            if (data.success && data.room) {
                joinRoomModal.close();
                await loadConversations();
                selectChat(data.room);
                showToast(`Joined room "${data.room.name}"!`, "success");
            } else {
                showToast(data.error || "Invalid room code.", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to join room.", "error");
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = "Join Room";
            }
        }
    }

    // ── Participants Modal ─────────────────────────
    async function openParticipantsModal() {
        if (!activeChatObj || activeChatObj.type !== "room" || !participantsModal) return;
        participantsModal.showModal();

        const listEl = document.getElementById("roomParticipantsList");
        if (!listEl) return;
        listEl.innerHTML = `<p style="padding:12px;text-align:center;">Loading participants…</p>`;

        try {
            const data = await api(`/api/user-chat/rooms/participants?roomCode=${encodeURIComponent(activeChatObj.code)}`);
            if (data.success && Array.isArray(data.participants)) {
                listEl.innerHTML = "";
                data.participants.forEach(p => {
                    const row = document.createElement("div");
                    row.className = "chat-list-item";
                    row.style.cursor = "default";
                    const lastSeen = p.last_seen
                        ? new Date(p.last_seen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                        : "";
                    row.innerHTML = `
                        <div class="chat-item-avatar" style="position:relative;">
                            ${esc(p.avatar || "P")}
                            ${p.online ? `<span class="online-dot"></span>` : ""}
                        </div>
                        <div class="chat-item-details">
                            <span class="chat-item-name">
                                ${esc(p.display_name)} ${p.is_owner ? `<span style="color:var(--gold);font-size:11px;">(Owner)</span>` : ""}
                            </span>
                            <span class="chat-item-preview">
                                ${p.online ? `<span style="color:var(--gold);">● Online</span>` : `Last seen ${lastSeen}`}
                            </span>
                        </div>
                    `;
                    listEl.appendChild(row);
                });
            }
        } catch (e) { console.warn(e); }
    }

    // ── Toast Notifications ───────────────────────
    function showToast(message, type = "info") {
        let container = document.getElementById("pixelToastContainer");
        if (!container) {
            container = document.createElement("div");
            container.id = "pixelToastContainer";
            document.body.appendChild(container);
        }

        const toast = document.createElement("div");
        toast.className = `pixel-toast pixel-toast--${type}`;
        toast.innerHTML = `
            <i class="fa-solid fa-${type === "error" ? "circle-exclamation" : type === "success" ? "circle-check" : "circle-info"}"></i>
            <span>${esc(message)}</span>
        `;
        container.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add("visible"));
        setTimeout(() => {
            toast.classList.remove("visible");
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    // ── Event Listeners ───────────────────────────
    function setupEventListeners() {
        document.getElementById("startCreateRoomBtn")?.addEventListener("click", openCreateRoomModal);
        document.getElementById("startJoinRoomBtn")?.addEventListener("click", openJoinRoomModal);
        document.getElementById("startDirectChatBtn")?.addEventListener("click", openSearchUserModal);
        document.getElementById("confirmCreateRoomBtn")?.addEventListener("click", handleCreateRoom);
        document.getElementById("confirmJoinRoomBtn")?.addEventListener("click", handleJoinRoom);

        document.getElementById("createRoomNameInput")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleCreateRoom();
            }
        });

        document.getElementById("joinRoomCodeInput")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                handleJoinRoom();
            }
        });

        document.getElementById("searchUserInput")?.addEventListener("input", e => performUserSearch(e.target.value));

        roomCodePill?.addEventListener("click", () => {
            if (activeChatObj?.code) {
                navigator.clipboard.writeText(activeChatObj.code).catch(() => {});
                showToast(`Code ${activeChatObj.code} copied to clipboard!`, "success");
            }
        });

        deleteRoomBtn?.addEventListener("click", handleDeleteRoom);
        participantsBtn?.addEventListener("click", openParticipantsModal);
        clearHistoryBtn?.addEventListener("click", handleClearHistory);
        editTopicBtn?.addEventListener("click", handleEditTopic);
        pinnedBtn?.addEventListener("click", togglePinnedPanel);
        cancelReplyBtn?.addEventListener("click", clearReplyTo);

        // Batch Action Bar Listeners
        batchCopyBtn?.addEventListener("click", handleBatchCopy);
        batchDeleteBtn?.addEventListener("click", handleBatchDelete);
        cancelMultiSelectBtn?.addEventListener("click", exitMultiSelectMode);

        // Drag & Drop Attachments
        const mainArea = document.querySelector(".user-chat-main");
        if (mainArea) {
            mainArea.addEventListener("dragover", e => {
                e.preventDefault();
                mainArea.style.border = "2px dashed var(--gold)";
            });
            mainArea.addEventListener("dragleave", e => {
                e.preventDefault();
                mainArea.style.border = "none";
            });
            mainArea.addEventListener("drop", e => {
                e.preventDefault();
                mainArea.style.border = "none";
                if (e.dataTransfer?.files?.length > 0) {
                    handleFileSelection(e.dataTransfer.files);
                }
            });
        }

        // Sidebar Live Search
        const sidebarSearchInput = document.getElementById("userChatSidebarSearchInput");
        sidebarSearchInput?.addEventListener("input", (e) => {
            sidebarSearchQuery = (e.target.value || "").trim().toLowerCase();
            renderConversationsList();
        });

        // Floating Scroll-To-Bottom
        const scrollBtn = document.getElementById("userChatScrollBottomBtn");
        scrollBtn?.addEventListener("click", () => smartScrollToBottom(true));

        messagesArea?.addEventListener("scroll", () => {
            if (isUserNearBottom()) {
                unreadNewMessagesCount = 0;
                if (scrollBtn) scrollBtn.style.display = "none";
            }
        });

        // Emoji Picker Popup
        const emojiBtn = document.getElementById("userChatEmojiBtn");
        const POPULAR_EMOJIS = ["😊", "😂", "❤️", "👍", "🔥", "🎉", "✨", "🙌", "😍", "😎", "🚀", "💡", "🤔", "👏", "💯", "🙏", "🤩", "🥳"];

        emojiBtn?.addEventListener("click", (e) => {
            e.stopPropagation();
            let popup = document.getElementById("activeEmojiPicker");
            if (popup) {
                popup.remove();
                return;
            }
            popup = document.createElement("div");
            popup.className = "emoji-picker-popup";
            popup.id = "activeEmojiPicker";
            popup.innerHTML = POPULAR_EMOJIS.map(em => `<button class="emoji-picker-btn" data-emoji="${em}" type="button">${em}</button>`).join("");
            
            const composerBox = document.querySelector(".user-chat-composer-box");
            if (composerBox) {
                composerBox.parentElement.style.position = "relative";
                composerBox.parentElement.appendChild(popup);
            }

            popup.querySelectorAll(".emoji-picker-btn").forEach(btn => {
                btn.addEventListener("click", () => {
                    const em = btn.dataset.emoji;
                    if (messageInput && em) {
                        const start = messageInput.selectionStart || messageInput.value.length;
                        const end = messageInput.selectionEnd || messageInput.value.length;
                        messageInput.value = messageInput.value.substring(0, start) + em + messageInput.value.substring(end);
                        messageInput.focus();
                        messageInput.selectionStart = messageInput.selectionEnd = start + em.length;
                    }
                    popup.remove();
                });
            });

            const closePicker = (ev) => {
                if (!popup.contains(ev.target) && ev.target !== emojiBtn) {
                    popup.remove();
                    document.removeEventListener("click", closePicker);
                }
            };
            setTimeout(() => document.addEventListener("click", closePicker), 10);
        });

        // Dialog Close & Backdrop Centering / Scroll Lock
        document.querySelectorAll("dialog").forEach(dlg => {
            dlg.querySelectorAll(".modal-close, .panel-close").forEach(btn => {
                btn.addEventListener("click", () => {
                    if (dlg.open) dlg.close();
                });
            });
            dlg.addEventListener("click", (e) => {
                const rect = dlg.getBoundingClientRect();
                if (
                    e.clientX < rect.left ||
                    e.clientX > rect.right ||
                    e.clientY < rect.top ||
                    e.clientY > rect.bottom
                ) {
                    dlg.close();
                }
            });
            dlg.addEventListener("close", () => {
                if (!document.querySelector("dialog[open]")) {
                    document.body.classList.remove("modal-open");
                }
            });
        });

        document.getElementById("userChatBackBtn")?.addEventListener("click", () => {
            const chatContainer = document.querySelector(".user-chat-container");
            if (chatContainer) chatContainer.classList.remove("has-active-chat");
        });

        searchToggleBtn?.addEventListener("click", () => {
            if (!searchWrap) return;
            const show = searchWrap.hidden;
            searchWrap.hidden = !show;
            if (show && searchInput) searchInput.focus();
        });

        document.querySelectorAll(".user-chat-header-menu").forEach(menu => {
            menu.addEventListener("click", event => {
                if (event.target.closest("button, .room-code-tag")) menu.open = false;
            });
            document.addEventListener("click", event => {
                if (!menu.contains(event.target)) menu.open = false;
            });
        });

        searchInput?.addEventListener("input", () => renderMessages());

        attachBtn?.addEventListener("click", () => fileInput?.click());
        fileInput?.addEventListener("change", e => {
            handleFileSelection(e.target.files);
            e.target.value = "";
        });

        sendBtn?.addEventListener("click", sendMessage);

        messageInput?.addEventListener("keydown", e => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput?.addEventListener("input", () => {
            if (!activeChatId) return;
            if (!isCurrentlyTyping) {
                isCurrentlyTyping = true;
                sendTypingSignal(true);
            }
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                isCurrentlyTyping = false;
                sendTypingSignal(false);
            }, 2000);

            messageInput.style.height = "auto";
            messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
        });
    }

    // ── Init ──────────────────────────────────────
    window.addEventListener("DOMContentLoaded", () => {
        initUserIdentity();
        setupEventListeners();
    });

    window.addEventListener("pixel-auth-ready", initUserIdentity);

    window.loadUserChatSystem = () => {
        if (!currentUser) {
            initUserIdentity();
        } else {
            loadConversations();
        }
    };

    window.showChatToast = showToast;
})();
