// ==========================================
// Pixel AI 2.0: Core Chat Engine
// ==========================================

(function() {
    let activeAbortController = null;
    let isGenerating = false;
    let editingMessage = null;
    const attachmentCache = new Map();

    const textarea = document.getElementById("promptInput");
    const sendBtn = document.getElementById("sendBtn");
    const stopBtn = document.getElementById("stopBtn");
    const chatArea = document.getElementById("chatArea");
    const chatContainer = document.querySelector(".chat-container");
    const scrollToBottomBtn = document.getElementById("aiScrollToBottomBtn");
    const welcome = document.querySelector(".welcome");
    const cursorGlow = document.querySelector(".cursor-glow");
    const editNotice = document.getElementById("chatEditNotice");
    const cancelEditBtn = document.getElementById("cancelChatEditBtn");

    function getAnonymousSessionId() {
        let id = localStorage.getItem("pixel-anonymous-session");
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem("pixel-anonymous-session", id);
        }
        return id;
    }
    window.getPixelAnonymousSessionId = getAnonymousSessionId;

    // Interactive cursor glow for fine pointers
    if (cursorGlow && window.matchMedia("(pointer: fine)").matches) {
        window.addEventListener("pointermove", event => {
            cursorGlow.style.left = `${event.clientX}px`;
            cursorGlow.style.top = `${event.clientY}px`;
        }, { passive: true });
    }

    function shouldAutoScroll() {
        return localStorage.getItem("pixel-auto-scroll") !== "false";
    }

    function updateScrollToBottomButton() {
        if (!scrollToBottomBtn || !chatContainer) return;
        const hasMessages = Boolean(chatArea?.querySelector(".message"));
        const distanceFromBottom = chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight;
        scrollToBottomBtn.hidden = !hasMessages || distanceFromBottom < 120;
    }

    function scrollToLatest() {
        if (shouldAutoScroll() && chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        updateScrollToBottomButton();
    }

    function setGeneratingState(generating) {
        isGenerating = generating;
        if (sendBtn && stopBtn) {
            if (generating) {
                sendBtn.style.display = "none";
                stopBtn.style.display = "flex";
                stopBtn.removeAttribute("disabled");
            } else {
                stopBtn.style.display = "none";
                sendBtn.style.display = "flex";
                sendBtn.removeAttribute("disabled");
            }
        }
    }

    function createAssistantActions() {
        return `
            <div class="message-actions" aria-label="Assistant response actions">
                <button class="message-action" type="button" data-message-action="copy" title="Copy response">
                    <i class="fa-regular fa-copy"></i>
                    <span>Copy</span>
                </button>
                <button class="message-action" type="button" data-message-action="retry" title="Regenerate response">
                    <i class="fa-solid fa-rotate-right"></i>
                    <span>Regenerate</span>
                </button>
                <button class="message-action" type="button" data-message-action="like" title="Helpful response">
                    <i class="fa-regular fa-thumbs-up"></i>
                </button>
                <button class="message-action" type="button" data-message-action="dislike" title="Unhelpful response">
                    <i class="fa-regular fa-thumbs-down"></i>
                </button>
                <button class="message-action" type="button" data-message-action="download" title="Download as Markdown">
                    <i class="fa-solid fa-download"></i>
                </button>
            </div>
        `;
    }

    function createUserActions(canEdit = true) {
        return `
            <div class="user-message-actions">
                ${canEdit ? `<button class="user-action-btn" type="button" data-user-action="edit" title="Edit message" aria-label="Edit message"><i class="fa-solid fa-pen"></i></button>` : ""}
                <button class="user-action-btn" type="button" data-user-action="copy" title="Copy text">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `;
    }

    function addMessageToUI(text, sender, { streaming = false, attachments = [], historyIndex, createdAt } = {}) {
        if (!chatArea) return null;

        const messageEl = document.createElement("div");
        messageEl.className = `message ${sender}`;
        messageEl.dataset.rawText = text || "";
        if (Number.isInteger(historyIndex)) messageEl.dataset.historyIndex = String(historyIndex);
        const messageTime = createdAt || new Date().toISOString();
        messageEl.dataset.createdAt = messageTime;

        if (sender === "ai") {
            messageEl.innerHTML = `
                <div class="ai-avatar">
                    <img src="assets/pixel.png" alt="Pixel AI">
                </div>
                <div class="ai-message-body">
                    <div class="bubble">
                        <div class="message-content${streaming ? " stream" : ""}"></div>
                    </div>
                    ${createAssistantActions()}
                </div>
            `;
            const contentEl = messageEl.querySelector(".message-content");
            if (streaming) {
                contentEl.textContent = text || "";
            } else {
                contentEl.innerHTML = typeof window.formatMessage === "function"
                    ? window.formatMessage(text || "")
                    : escapeHtml(text || "");
                window.typesetMath?.(contentEl);
            }
        } else {
            let attachmentsHtml = "";
            if (attachments && attachments.length > 0) {
                const imagesHtml = attachments
                    .filter(a => a.isImage && a.data)
                    .filter(a => /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+={0,2}$/i.test(a.data))
                    .map(a => `<div class="user-img-wrapper"><img src="${a.data}" class="user-img-thumb" alt="${escapeHtml(a.name)}" loading="lazy"></div>`)
                    .join("");

                const docsHtml = attachments
                    .filter(a => !a.isImage)
                    .map(a => `<span class="user-doc-chip"><i class="fa-solid fa-file"></i> ${escapeHtml(a.name)}</span>`)
                    .join("");

                attachmentsHtml = `
                    <div class="user-attachments-grid">
                        ${imagesHtml}
                        ${docsHtml ? `<div class="user-docs-row">${docsHtml}</div>` : ""}
                    </div>
                `;
            }

            const textHtml = text ? `<div class="user-text">${escapeHtml(text)}</div>` : "";

            messageEl.innerHTML = `
                <div class="user-message-body">
                    <div class="bubble">
                        ${attachmentsHtml}
                        ${textHtml}
                    </div>
                    ${createUserActions(!attachments.length)}
                </div>
            `;
        }

        if (sender !== "thinking") {
            const stamp = document.createElement("time");
            stamp.className = "message-timestamp";
            stamp.dateTime = messageTime;
            stamp.textContent = new Date(messageTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
            messageEl.querySelector(".ai-message-body, .user-message-body")?.append(stamp);
        }

        chatArea.appendChild(messageEl);
        scrollToLatest();
        return messageEl;
    }

    function showThinking() {
        removeThinking();
        if (!chatArea) return;

        const thinking = document.createElement("div");
        thinking.id = "thinking";
        thinking.className = "message ai thinking-msg";
        thinking.innerHTML = `
            <div class="ai-avatar">
                <img src="assets/pixel.png" alt="Pixel">
            </div>
            <div class="ai-message-body">
                <div class="bubble">
                    <div class="thinking-indicator">
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span class="thinking-dot"></span>
                        <span class="thinking-label">Pixel is thinking...</span>
                    </div>
                </div>
            </div>
        `;
        chatArea.appendChild(thinking);
        scrollToLatest();
    }

    function removeThinking() {
        const el = document.getElementById("thinking");
        if (el) el.remove();
    }

    function renderErrorState(errorType, customMessage = "", originalPrompt = "", retryContext = null) {
        removeThinking();
        const errorEl = document.createElement("div");
        errorEl.className = "message ai error-state";

        let title = "Something went wrong";
        let message = customMessage || "Pixel encountered an unexpected error.";
        let actionBtnText = "Try Again";
        let actionHandler = "retry";

        if (errorType === "network") {
            title = "Connection Lost";
            message = "Check your internet connection and try again.";
            actionBtnText = "Retry Connection";
        } else if (errorType === "unavailable") {
            title = "Model Temporarily Unavailable";
            message = customMessage || "This model is currently experiencing high demand. Switch to Auto for instant response.";
            actionBtnText = "Switch to Auto & Retry";
            actionHandler = "switch-auto";
        } else if (errorType === "rate-limit") {
            title = "A short pause is needed";
            message = "Too many requests were sent. Wait a moment, then try again.";
        } else if (errorType === "invalid") {
            title = "Message could not be sent";
            message = customMessage || "Check the message and attachments, then try again.";
        }

        errorEl.innerHTML = `
            <div class="ai-avatar">
                <i class="fa-solid fa-triangle-exclamation error-icon"></i>
            </div>
            <div class="ai-message-body">
                <div class="bubble error-bubble">
                    <div class="error-title">${escapeHtml(title)}</div>
                    <div class="error-desc">${escapeHtml(message)}</div>
                    <button class="error-retry-btn" type="button" data-retry-action="${actionHandler}">
                        <i class="fa-solid fa-rotate-right"></i>
                        <span>${actionBtnText}</span>
                    </button>
                </div>
            </div>
        `;

        const retryBtn = errorEl.querySelector(".error-retry-btn");
        retryBtn.addEventListener("click", async () => {
            errorEl.remove();
            if (actionHandler === "switch-auto") {
                if (typeof window.setCurrentModel === "function") {
                    window.setCurrentModel("auto");
                }
            }
            if (originalPrompt) {
                if (retryContext?.userElement) {
                    await retryFromUserMessage(retryContext.userElement, originalPrompt);
                } else {
                    if (textarea) textarea.value = originalPrompt;
                    await sendMessage();
                }
            }
        });

        chatArea.appendChild(errorEl);
        scrollToLatest();
    }

    // ------------------------------------------
    // Send Message Lifecycle
    // ------------------------------------------
    async function sendMessage(options = {}) {
        if (!textarea) return;
        const text = textarea.value.trim();
        let attachments = typeof window.getUploadedAttachments === "function"
            ? window.getUploadedAttachments()
            : [];

        if ((!text && attachments.length === 0) || isGenerating) return;

        let convId = typeof window.getCurrentConversationId === "function"
            ? window.getCurrentConversationId()
            : null;

        let isNewConversation = false;
        if (!convId) {
            if (typeof window.createConversation === "function") {
                const titleSource = text || (attachments[0] ? `File: ${attachments[0].name}` : "New Chat");
                convId = await window.createConversation(titleSource.slice(0, 40));
                isNewConversation = true;
            }
        }

        let replacement = options?.replaceHistory ? options : null;
        if (editingMessage) {
            const historyIndex = editingMessage.historyIndex;
            replacement = {
                replaceHistory: true,
                history: window.truncateLocalMessages?.(convId, historyIndex) || [],
                truncateFrom: editingMessage.createdAt
            };
            attachments = attachments.length ? attachments : (attachmentCache.get(editingMessage.createdAt) || []);
            removeMessagesFrom(historyIndex);
            editingMessage = null;
            if (editNotice) editNotice.hidden = true;
        }

        if (replacement) {
            window.truncateLocalMessages?.(convId, replacement.history.length);
            removeMessagesFrom(replacement.history.length);
            if (Array.isArray(replacement.attachments) && !attachments.length) attachments = replacement.attachments;
        }

        const historySource = replacement?.history || window.getLocalMessages?.(convId) || [];
        const requestHistory = historySource.slice(-19)
            .filter(entry => ["user", "assistant"].includes(entry.role) && typeof entry.content === "string")
            .map(entry => ({ role: entry.role, content: entry.content }));

        if (welcome) welcome.classList.add("hide");

        const historyIndex = window.getLocalMessages?.(convId).length || 0;
        const userEntry = window.recordLocalMessage?.(convId, "user", text);
        addMessageToUI(text, "user", { attachments, historyIndex, createdAt: userEntry?.created_at });
        if (attachments.length && userEntry?.created_at) attachmentCache.set(userEntry.created_at, attachments);

        // Reset input and attachments
        textarea.value = "";
        textarea.style.height = "auto";
        if (typeof window.clearUploads === "function") {
            window.clearUploads();
        }

        setGeneratingState(true);
        showThinking();

        // Setup abort controller
        activeAbortController = new AbortController();

        const currentModel = typeof window.getCurrentModel === "function"
            ? window.getCurrentModel()
            : { id: "auto" };

        const apiBase = window.API_BASE || "";

        try {
            const headers = { "Content-Type": "application/json", "X-Pixel-Session-Id": getAnonymousSessionId() };
            try {
                const { data } = await window.supabaseClient?.auth.getSession();
                if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
            } catch (error) {
                console.warn("[Pixel Chat] Could not restore the account session for this request.");
            }

            const response = await fetch(`${apiBase}/api/chat`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    conversationId: convId,
                    message: text,
                    model: currentModel.id,
                    attachments,
                    history: requestHistory,
                    ...(replacement ? {
                        replaceHistory: true,
                        truncateFrom: replacement.truncateFrom
                    } : {})
                }),
                signal: activeAbortController.signal
            });

            if (!response.ok) {
                let errData = null;
                try {
                    errData = await response.json();
                } catch {
                    // non-json response
                }

                const errorCode = errData?.error?.code;
                const userElement = chatArea.querySelector(`.message.user[data-history-index="${historyIndex}"]`);
                const retryContext = { userElement };
                if (response.status === 404 || errorCode === "MODEL_UNAVAILABLE") {
                    renderErrorState("unavailable", errData?.error?.message, text, retryContext);
                    return;
                }
                if (response.status === 429 || errorCode === "RATE_LIMITED") {
                    renderErrorState("rate-limit", "", text, retryContext);
                    return;
                }
                if (["INVALID_REQUEST", "INVALID_ATTACHMENT", "MODEL_UNSUPPORTED_ATTACHMENT", "INVALID_MODEL", "MESSAGE_TOO_LARGE"].includes(errorCode)) {
                    renderErrorState("invalid", errData?.error?.message, "", null);
                    return;
                }
                throw new Error("Pixel could not complete this request.");
            }

            if (!response.body) {
                throw new Error("Readable stream is not supported in this browser.");
            }

            removeThinking();
            const assistantIndex = window.getLocalMessages?.(convId).length || 0;
            const aiMessageEl = addMessageToUI("", "ai", { streaming: true, historyIndex: assistantIndex });
            const contentEl = aiMessageEl.querySelector(".message-content");
            const streamText = document.createTextNode("");
            contentEl.replaceChildren(streamText);
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let scrollScheduled = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                streamText.appendData(chunk);
                aiMessageEl.dataset.rawText = fullText;
                if (!scrollScheduled) {
                    scrollScheduled = true;
                    requestAnimationFrame(() => {
                        scrollScheduled = false;
                        if (shouldAutoScroll()) scrollToLatest();
                        else updateScrollToBottomButton();
                    });
                }
            }

            fullText += decoder.decode();
            aiMessageEl.dataset.rawText = fullText;

            // Final Markdown Render
            contentEl.innerHTML = typeof window.formatMessage === "function"
                ? window.formatMessage(fullText)
                : escapeHtml(fullText);
            window.typesetMath?.(contentEl);
            contentEl.classList.remove("stream");
            const usedModelId = response.headers.get("X-Pixel-Model");
            if (usedModelId) {
                const model = window.getAvailableModels?.().find(item => item.id === usedModelId);
                const label = document.createElement("div");
                label.className = "response-model-meta";
                label.textContent = `${currentModel.id === "auto" ? "Auto · " : ""}${model?.name || usedModelId}${response.headers.get("X-Pixel-Fallback") === "true" ? " · fallback" : ""}`;
                aiMessageEl.querySelector(".ai-message-body")?.append(label);
            }
            scrollToLatest();

            if (typeof window.recordLocalMessage === "function") {
                const assistantEntry = window.recordLocalMessage(convId, "assistant", fullText);
                if (assistantEntry) {
                    aiMessageEl.dataset.historyIndex = String(assistantIndex);
                    aiMessageEl.dataset.createdAt = assistantEntry.created_at;
                    const stamp = aiMessageEl.querySelector(".message-timestamp");
                    if (stamp) {
                        stamp.dateTime = assistantEntry.created_at;
                        stamp.textContent = new Date(assistantEntry.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
                    }
                }
            }

            if (isNewConversation && typeof window.renameConversation === "function") {
                await window.renameConversation(convId, text);
            }

        } catch (err) {
            if (err.name === "AbortError") {
                console.log("[Pixel Chat] Generation stopped by user.");
                removeThinking();
                const latestAiMsg = chatArea.querySelector(".message.ai:last-child .message-content.stream");
                if (latestAiMsg) {
                    latestAiMsg.classList.remove("stream");
                    const raw = latestAiMsg.closest(".message.ai")?.dataset.rawText || "";
                    latestAiMsg.innerHTML = typeof window.formatMessage === "function"
                        ? window.formatMessage(raw + "\n\n*(Stopped)*")
                        : escapeHtml(raw);
                    window.typesetMath?.(latestAiMsg);
                }
            } else if (!navigator.onLine) {
                renderErrorState("network", "", text);
                } else {
                    console.error("[Pixel Chat] Generation error:", err);
                renderErrorState("server", "Pixel could not complete this request. Please try again.", text, {
                    userElement: chatArea.querySelector(`.message.user[data-history-index="${historyIndex}"]`)
                });
            }
        } finally {
            activeAbortController = null;
            setGeneratingState(false);
        if (textarea) textarea.focus();
        }
    }

    function removeMessagesFrom(index) {
        chatArea?.querySelectorAll(".message[data-history-index]").forEach(message => {
            if (Number(message.dataset.historyIndex) >= index) {
                window.clearMathTypesetting?.(message);
                message.remove();
            }
        });
    }

    function cancelMessageEdit() {
        editingMessage = null;
        if (editNotice) editNotice.hidden = true;
    }

    async function retryFromUserMessage(userElement, prompt) {
        if (!userElement || isGenerating) return;
        const conversationId = window.getCurrentConversationId?.();
        const index = Number(userElement.dataset.historyIndex);
        const timestamp = userElement.dataset.createdAt;
        const attachments = attachmentCache.get(timestamp) || [];
        const history = window.truncateLocalMessages?.(conversationId, index) || [];
        removeMessagesFrom(index);
        cancelMessageEdit();
        if (textarea) textarea.value = prompt;
        await sendMessage({ replaceHistory: true, history, truncateFrom: timestamp, attachments });
    }

    function stopGeneration() {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        setGeneratingState(false);
        removeThinking();
    }

    async function clearServerConversation(conversationId) {
        if (!conversationId) return;
        const headers = {
            "Content-Type": "application/json",
            "X-Pixel-Session-Id": getAnonymousSessionId()
        };
        try {
            const { data } = await window.supabaseClient?.auth.getSession();
            if (data?.session?.access_token) headers.Authorization = `Bearer ${data.session.access_token}`;
        } catch { }
        const response = await fetch(`${window.API_BASE || ""}/api/chat/clear`, {
            method: "POST",
            headers,
            body: JSON.stringify({ conversationId })
        });
        if (!response.ok) throw new Error("Unable to clear server-side conversation data.");
    }

    // ------------------------------------------
    // Event Delegations (Message Actions)
    // ------------------------------------------
    document.addEventListener("click", async (event) => {
        // Assistant Message Actions
        const actionBtn = event.target.closest(".message-action");
        if (actionBtn) {
            const messageEl = actionBtn.closest(".message.ai");
            const action = actionBtn.dataset.messageAction;
            const text = messageEl?.dataset.rawText || "";

            if (action === "copy") {
                await navigator.clipboard.writeText(text);
                const originalHtml = actionBtn.innerHTML;
                actionBtn.innerHTML = '<i class="fa-solid fa-check"></i><span>Copied</span>';
                actionBtn.classList.add("active");
                setTimeout(() => {
                    actionBtn.innerHTML = originalHtml;
                    actionBtn.classList.remove("active");
                }, 2000);
            }

            if (action === "like" || action === "dislike") {
                const group = messageEl.querySelectorAll('[data-message-action="like"], [data-message-action="dislike"]');
                group.forEach(b => b.classList.remove("active"));
                actionBtn.classList.add("active");
            }

            if (action === "retry") {
                if (isGenerating) return;
                const prevUser = messageEl.previousElementSibling?.classList.contains("user")
                    ? messageEl.previousElementSibling
                    : null;
                const promptToRetry = prevUser?.dataset.rawText;
                if (promptToRetry) {
                    await retryFromUserMessage(prevUser, promptToRetry);
                }
            }

            if (action === "download") {
                const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `pixel-response-${Date.now()}.md`;
                a.click();
                URL.revokeObjectURL(url);
            }
            return;
        }

        // User Message Actions (Edit & Copy)
        const userActionBtn = event.target.closest(".user-action-btn");
        if (userActionBtn) {
            const userMsgEl = userActionBtn.closest(".message.user");
            const action = userActionBtn.dataset.userAction;
            const rawText = userMsgEl?.dataset.rawText || userMsgEl?.querySelector(".bubble")?.textContent || "";

            if (action === "copy") {
                await navigator.clipboard.writeText(rawText);
                userActionBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                setTimeout(() => {
                    userActionBtn.innerHTML = '<i class="fa-regular fa-copy"></i>';
                }, 1500);
            }

            if (action === "edit") {
                if (textarea && userMsgEl && !userMsgEl.querySelector(".user-attachments-grid")) {
                    editingMessage = {
                        element: userMsgEl,
                        historyIndex: Number(userMsgEl.dataset.historyIndex),
                        createdAt: userMsgEl.dataset.createdAt
                    };
                    if (editNotice) editNotice.hidden = false;
                    textarea.value = rawText;
                    textarea.style.height = "auto";
                    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
                    textarea.focus();
                }
            }
            return;
        }

        // Starter Cards (Empty State)
        const starterCard = event.target.closest(".starter-card");
        if (starterCard) {
            const promptText = starterCard.dataset.prompt || starterCard.querySelector(".starter-text")?.textContent?.trim();
            if (promptText && textarea) {
                textarea.value = promptText;
                textarea.style.height = "auto";
                textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
                textarea.focus();
            }
        }
    });

    document.addEventListener("keydown", (event) => {
        const starterCard = event.target.closest?.(".starter-card");
        if (!starterCard || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        starterCard.click();
    });

    // ------------------------------------------
    // Composer Setup
    // ------------------------------------------
    window.addEventListener("DOMContentLoaded", () => {
        chatContainer?.addEventListener("scroll", updateScrollToBottomButton, { passive: true });
        scrollToBottomBtn?.addEventListener("click", () => {
            if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
        });

        if (sendBtn) {
            sendBtn.addEventListener("click", sendMessage);
        }

        cancelEditBtn?.addEventListener("click", () => {
            cancelMessageEdit();
            if (textarea) {
                textarea.value = "";
                textarea.style.height = "auto";
                textarea.focus();
            }
        });

        if (stopBtn) {
            stopBtn.addEventListener("click", stopGeneration);
        }

        if (textarea) {
            textarea.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    const sendWithEnter = localStorage.getItem("pixel-send-with-enter") !== "false";
                    if (sendWithEnter) {
                        e.preventDefault();
                        await sendMessage();
                    }
                }
            });

            textarea.addEventListener("input", () => {
                textarea.style.height = "auto";
                textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
            });
        }

        updateScrollToBottomButton();
    });

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[c]);
    }

    // Expose helpers globally
    window.addMessageToUI = addMessageToUI;
    window.sendMessage = sendMessage;
    window.stopGeneration = stopGeneration;
    window.cancelChatEdit = cancelMessageEdit;
    window.clearServerConversation = clearServerConversation;
})();
