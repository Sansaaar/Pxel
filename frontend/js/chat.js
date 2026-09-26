// ==========================================
// Pixel AI 2.0: Core Chat Engine
// ==========================================

(function() {
    let activeAbortController = null;
    let isGenerating = false;

    const textarea = document.getElementById("promptInput");
    const sendBtn = document.getElementById("sendBtn");
    const stopBtn = document.getElementById("stopBtn");
    const chatArea = document.getElementById("chatArea");
    const chatContainer = document.querySelector(".chat-container");
    const welcome = document.querySelector(".welcome");
    const cursorGlow = document.querySelector(".cursor-glow");

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

    function scrollToLatest() {
        if (shouldAutoScroll() && chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
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

    function createUserActions() {
        return `
            <div class="user-message-actions">
                <button class="user-action-btn" type="button" data-user-action="edit" title="Edit message">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="user-action-btn" type="button" data-user-action="copy" title="Copy text">
                    <i class="fa-regular fa-copy"></i>
                </button>
            </div>
        `;
    }

    function addMessageToUI(text, sender, { streaming = false, attachments = [] } = {}) {
        if (!chatArea) return null;

        const messageEl = document.createElement("div");
        messageEl.className = `message ${sender}`;
        messageEl.dataset.rawText = text || "";

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
                    .map(a => `<div class="user-img-wrapper"><img src="${a.data}" class="user-img-thumb" alt="${escapeHtml(a.name)}" onclick="window.open('${a.data}', '_blank')"></div>`)
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
                    ${createUserActions()}
                </div>
            `;
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

    function renderErrorState(errorType, customMessage = "", originalPrompt = "") {
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
                if (textarea) textarea.value = originalPrompt;
                await sendMessage();
            }
        });

        chatArea.appendChild(errorEl);
        scrollToLatest();
    }

    // ------------------------------------------
    // Send Message Lifecycle
    // ------------------------------------------
    async function sendMessage() {
        if (!textarea) return;
        const text = textarea.value.trim();
        const attachments = typeof window.getUploadedAttachments === "function"
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

        if (welcome) welcome.classList.add("hide");

        // Add user message to UI with attached thumbnails
        addMessageToUI(text, "user", { attachments });
        if (typeof window.recordLocalMessage === "function") {
            window.recordLocalMessage(convId, "user", text);
        }

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
            const response = await fetch(`${apiBase}/api/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    conversationId: convId,
                    message: text,
                    model: currentModel.id,
                    attachments: attachments
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

                if (response.status === 404 || (errData?.error?.code === "MODEL_UNAVAILABLE")) {
                    renderErrorState("unavailable", errData?.error?.message, text);
                    return;
                }

                throw new Error(errData?.error?.message || `Server responded with status ${response.status}`);
            }

            if (!response.body) {
                throw new Error("Readable stream is not supported in this browser.");
            }

            removeThinking();
            const aiMessageEl = addMessageToUI("", "ai", { streaming: true });
            const contentEl = aiMessageEl.querySelector(".message-content");
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullText = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                fullText += chunk;
                contentEl.textContent = fullText;
                aiMessageEl.dataset.rawText = fullText;
                scrollToLatest();
            }

            fullText += decoder.decode();
            aiMessageEl.dataset.rawText = fullText;

            // Final Markdown Render
            contentEl.innerHTML = typeof window.formatMessage === "function"
                ? window.formatMessage(fullText)
                : escapeHtml(fullText);
            window.typesetMath?.(contentEl);
            contentEl.classList.remove("stream");
            scrollToLatest();

            if (typeof window.recordLocalMessage === "function") {
                window.recordLocalMessage(convId, "assistant", fullText);
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
                renderErrorState("server", err.message, text);
            }
        } finally {
            activeAbortController = null;
            setGeneratingState(false);
            if (textarea) textarea.focus();
        }
    }

    function stopGeneration() {
        if (activeAbortController) {
            activeAbortController.abort();
            activeAbortController = null;
        }
        setGeneratingState(false);
        removeThinking();
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
                    messageEl.remove();
                    if (textarea) textarea.value = promptToRetry;
                    await sendMessage();
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
                if (textarea) {
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

    // ------------------------------------------
    // Composer Setup
    // ------------------------------------------
    window.addEventListener("DOMContentLoaded", () => {
        if (sendBtn) {
            sendBtn.addEventListener("click", sendMessage);
        }

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
})();
