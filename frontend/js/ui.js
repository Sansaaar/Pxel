// ==========================================
// Pixel AI 2.0: UI Panels, Settings & Modals
// ==========================================

(function() {
    const contextMenu = document.getElementById("chatContextMenu");

    function openSettingsModal() {
        const dialog = document.getElementById("settingsPanel");
        if (dialog) {
            dialog.showModal();
        }
    }

    function closeSettingsModal() {
        const dialog = document.getElementById("settingsPanel");
        if (dialog?.open) {
            dialog.close();
        }
    }

    // Tab Navigation inside Settings
    function setupSettingsTabs() {
        const tabs = document.querySelectorAll(".settings-tab");
        const pages = document.querySelectorAll(".settings-page");

        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const target = tab.dataset.settingsTab;
                tabs.forEach(t => t.classList.toggle("active", t === tab));
                pages.forEach(p => p.classList.toggle("active", p.dataset.settingsPage === target));
            });
        });
    }

    // Preferences Management
    function setupPreferences() {
        // Theme (Light Mode toggle)
        const lightModeToggle = document.getElementById("lightModeToggle");
        if (lightModeToggle) {
            const isLight = localStorage.getItem("pixel-light-mode") === "true";
            lightModeToggle.checked = isLight;
            document.body.classList.toggle("light-mode", isLight);

            lightModeToggle.addEventListener("change", () => {
                const active = lightModeToggle.checked;
                localStorage.setItem("pixel-light-mode", active);
                document.body.classList.toggle("light-mode", active);
            });
        }

        // Reduce Motion
        const reduceMotionToggle = document.getElementById("reduceMotionToggle");
        if (reduceMotionToggle) {
            const active = localStorage.getItem("pixel-reduce-motion") === "true";
            reduceMotionToggle.checked = active;
            document.body.classList.toggle("reduce-motion", active);

            reduceMotionToggle.addEventListener("change", () => {
                localStorage.setItem("pixel-reduce-motion", reduceMotionToggle.checked);
                document.body.classList.toggle("reduce-motion", reduceMotionToggle.checked);
            });
        }

        // Texture Toggle
        const textureToggle = document.getElementById("textureToggle");
        if (textureToggle) {
            const active = localStorage.getItem("pixel-texture") !== "false";
            textureToggle.checked = active;
            document.body.classList.toggle("texture-disabled", !active);

            textureToggle.addEventListener("change", () => {
                localStorage.setItem("pixel-texture", textureToggle.checked);
                document.body.classList.toggle("texture-disabled", !textureToggle.checked);
            });
        }

        // Enter to Send
        const sendWithEnterToggle = document.getElementById("sendWithEnterToggle");
        if (sendWithEnterToggle) {
            const active = localStorage.getItem("pixel-send-with-enter") !== "false";
            sendWithEnterToggle.checked = active;
            sendWithEnterToggle.addEventListener("change", () => {
                localStorage.setItem("pixel-send-with-enter", sendWithEnterToggle.checked);
            });
        }

        const defaultModelSelect = document.getElementById("defaultModelSelect");
        function populateDefaultModels() {
            if (!defaultModelSelect) return;
            const models = window.getAvailableModels?.() || [];
            const selectedId = window.getCurrentModel?.().id || "auto";
            defaultModelSelect.replaceChildren(...models.filter(model => model.available !== false).map(model => {
                const option = document.createElement("option");
                option.value = model.id;
                option.textContent = `${model.name} · ${model.badge || model.provider}`;
                return option;
            }));
            defaultModelSelect.value = selectedId;
        }
        populateDefaultModels();
        window.addEventListener("pixel-models-updated", populateDefaultModels);
        defaultModelSelect?.addEventListener("change", () => window.setCurrentModel?.(defaultModelSelect.value));

        // Auto Scroll
        const autoScrollToggle = document.getElementById("autoScrollToggle");
        if (autoScrollToggle) {
            const active = localStorage.getItem("pixel-auto-scroll") !== "false";
            autoScrollToggle.checked = active;
            autoScrollToggle.addEventListener("change", () => {
                localStorage.setItem("pixel-auto-scroll", autoScrollToggle.checked);
            });
        }

        // Response Width
        const responseWidthSelect = document.getElementById("responseWidthSelect");
        if (responseWidthSelect) {
            const savedWidth = localStorage.getItem("pixel-response-width") || "920px";
            responseWidthSelect.value = savedWidth;
            document.documentElement.style.setProperty("--content-width", savedWidth);

            responseWidthSelect.addEventListener("change", () => {
                localStorage.setItem("pixel-response-width", responseWidthSelect.value);
                document.documentElement.style.setProperty("--content-width", responseWidthSelect.value);
            });
        }
    }

    // Profile Management
    async function loadUserProfile() {
        let name = "Pixel User";
        let email = "guest@pixel.local";

        if (window.supabaseClient) {
            try {
                const { data } = await window.supabaseClient.auth.getUser();
                if (data?.user) {
                    email = data.user.email || email;
                    name = localStorage.getItem("pixel-display-name") ||
                        data.user.user_metadata?.display_name ||
                        email.split("@")[0];
                }
            } catch (e) {
                console.warn("[Pixel UI] Profile fetch fallback:", e);
            }
        }

        const savedName = localStorage.getItem("pixel-display-name");
        if (savedName) name = savedName;

        const initial = (name || "P").trim().charAt(0).toUpperCase();

        const nameEls = document.querySelectorAll("#profileName, #profileNameLarge");
        const emailEls = document.querySelectorAll("#profileEmail, #profileEmailLarge");
        const avatarEls = document.querySelectorAll("#profileAvatar, #profileAvatarLarge");
        const inputEl = document.getElementById("displayNameInput");

        nameEls.forEach(el => el.textContent = name);
        emailEls.forEach(el => el.textContent = email);
        avatarEls.forEach(el => el.textContent = initial);
        if (inputEl) inputEl.value = name;
    }

    async function saveProfile() {
        const input = document.getElementById("displayNameInput");
        const name = input?.value?.trim();
        if (!name) return;

        localStorage.setItem("pixel-display-name", name);
        await loadUserProfile();

        if (window.supabaseClient) {
            try {
                await window.supabaseClient.auth.updateUser({
                    data: { display_name: name }
                });
            } catch (e) {
                console.warn("[Pixel UI] Remote profile update failed:", e);
            }
        }

        const saveBtn = document.getElementById("saveProfileBtn");
        if (saveBtn) {
            const original = saveBtn.innerHTML;
            saveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Saved';
            setTimeout(() => { saveBtn.innerHTML = original; }, 1500);
        }
    }

    async function handleLogout() {
        if (window.supabaseClient) {
            try {
                await window.supabaseClient.auth.signOut();
            } catch (e) {
                console.warn("[Pixel UI] Sign out error:", e);
            }
        }
        localStorage.removeItem("pixel-guest");
        localStorage.removeItem("currentConversation");
        window.location.href = "login.html";
    }

    // Context Menu Handling
    function hideContextMenu() {
        if (contextMenu) {
            contextMenu.classList.remove("show");
            window.contextConversation = null;
        }
    }

    function setupContextMenu() {
        document.addEventListener("click", (e) => {
            if (!e.target.closest("#chatContextMenu")) {
                hideContextMenu();
            }
        });

        contextMenu?.addEventListener("click", async (e) => {
            const actionBtn = e.target.closest("[data-chat-action]");
            if (!actionBtn || !window.contextConversation) return;

            const action = actionBtn.dataset.chatAction;
            const conv = window.contextConversation;
            hideContextMenu();

            if (action === "rename") {
                const newTitle = window.prompt("Rename conversation:", conv.title);
                if (newTitle && newTitle.trim() && typeof window.renameConversation === "function") {
                    await window.renameConversation(conv.id, newTitle.trim());
                }
            } else if (action === "pin") {
                if (typeof window.togglePin === "function") {
                    window.togglePin(conv.id);
                }
            } else if (action === "delete") {
                if (window.confirm(`Delete conversation "${conv.title}"? This cannot be undone.`)) {
                    if (typeof window.deleteConversation === "function") {
                        await window.deleteConversation(conv.id);
                    }
                }
            }
        });
    }

    // Data Controls
    function setupDataControls() {
        const clearCurrentBtn = document.getElementById("clearChatBtn");
        if (clearCurrentBtn) {
            clearCurrentBtn.addEventListener("click", async () => {
                const convId = typeof window.getCurrentConversationId === "function"
                    ? window.getCurrentConversationId()
                    : null;
                if (!convId) return;

                if (window.confirm("Clear all messages in the current conversation?")) {
                    const chatArea = document.getElementById("chatArea");
                    if (chatArea) {
                        window.clearMathTypesetting?.(chatArea);
                        chatArea.replaceChildren();
                    }
                    const welcome = document.querySelector(".welcome");
                    if (welcome) welcome.classList.remove("hide");

                    await window.clearConversationMessages?.(convId);
                    window.clearServerConversation?.(convId)?.catch(error => {
                        console.warn("[Pixel UI] Could not clear server-side chat memory:", error);
                    });

                    closeSettingsModal();
                }
            });
        }

        const deleteAllBtn = document.getElementById("deleteAllChatsBtn");
        if (deleteAllBtn) {
            deleteAllBtn.addEventListener("click", async () => {
                if (window.confirm("Are you sure you want to delete ALL conversations? This cannot be undone.")) {
                    if (typeof window.clearAllConversations === "function") {
                        await window.clearAllConversations();
                    }
                    closeSettingsModal();
                }
            });
        }
    }

    window.addEventListener("DOMContentLoaded", () => {
        setupSettingsTabs();
        setupPreferences();
        setupContextMenu();
        setupDataControls();
        loadUserProfile();

        // Settings triggers
        document.querySelectorAll("#settingsBtn, #settingsTopBtn, .open-settings-trigger").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                openSettingsModal();
            });
        });

        document.querySelectorAll(".panel-close, .modal-close").forEach(btn => {
            btn.addEventListener("click", closeSettingsModal);
        });

        const saveProfileBtn = document.getElementById("saveProfileBtn");
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener("click", saveProfile);
        }

        document.querySelectorAll("#logoutBtn, #logoutSettingsBtn").forEach(btn => {
            btn.addEventListener("click", handleLogout);
        });
    });

    window.openPixelSettings = openSettingsModal;
    window.closePixelSettings = closeSettingsModal;
})();
