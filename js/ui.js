// Pixel chat interface controls

const uiClient = window.supabaseClient;
const panels = document.querySelectorAll(".side-panel");
const contextMenu = document.getElementById("chatContextMenu");
let contextConversation = null;

function closePanels() {
    panels.forEach(panel => {
        panel.classList.remove("show");
        panel.setAttribute("aria-hidden", "true");
    });
    document.body.classList.remove("settings-open");
    const settingsDialog = document.getElementById("settingsPanel");
    if (settingsDialog?.open) settingsDialog.close();
}

function openPanel(id) {
    const panel = document.getElementById(id);
    if (!panel) return;
    if (id === "settingsPanel") {
        closePanels();
        panel.showModal();
        return;
    }
    const isOpen = panel.classList.contains("show");
    closePanels();
    if (!isOpen) {
        panel.classList.add("show");
        panel.setAttribute("aria-hidden", "false");
        document.body.classList.toggle("settings-open", id === "settingsPanel");
    }
}

// Exposed for the top toolbar button so it remains reliable even when other
// page listeners or decorative layers are present.
window.openPixelSettings = event => {
    event?.preventDefault();
    event?.stopImmediatePropagation();
    const settingsDialog = document.getElementById("settingsPanel");
    if (!settingsDialog.open) settingsDialog.showModal();
};

document.querySelectorAll(".panel-close").forEach(button => {
    button.addEventListener("click", closePanels);
});

document.getElementById("searchChatsBtn")?.addEventListener("click", () => {
    openPanel("searchPanel");
    requestAnimationFrame(() => document.getElementById("chatSearchInput")?.focus());
});
document.getElementById("settingsBtn")?.addEventListener("click", () => openPanel("settingsPanel"));
document.getElementById("profileBtn")?.addEventListener("click", () => openPanel("profilePanel"));

function updateProfileUI({ name, email }) {
    const initial = (name || email || "P").trim().charAt(0).toUpperCase();
    [["profileName", name], ["profileNameLarge", name], ["profileEmail", email], ["profileEmailLarge", email], ["profileAvatar", initial], ["profileAvatarLarge", initial]]
        .forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        });
    document.getElementById("displayNameInput").value = name;
}

async function loadProfile() {
    if (!uiClient) return;
    const { data } = await uiClient.auth.getUser();
    const user = data?.user;
    if (!user) return;
    const name = localStorage.getItem("pixel-display-name") || user.user_metadata?.display_name || user.email.split("@")[0];
    updateProfileUI({ name, email: user.email });
}

document.getElementById("saveProfileBtn")?.addEventListener("click", async () => {
    const input = document.getElementById("displayNameInput");
    const name = input.value.trim();
    if (!name) return input.focus();
    localStorage.setItem("pixel-display-name", name);
    const email = document.getElementById("profileEmail").textContent;
    updateProfileUI({ name, email });
    await uiClient?.auth.updateUser({ data: { display_name: name } });
});

document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await uiClient?.auth.signOut();
    window.location.href = "login.html";
});

function applyPreference(className, enabled) {
    document.body.classList.toggle(className, enabled);
    localStorage.setItem(`pixel-${className}`, enabled);
}

[["reduceMotionToggle", "reduce-motion"], ["compactChatsToggle", "compact-chats"]].forEach(([id, className]) => {
    const toggle = document.getElementById(id);
    const enabled = localStorage.getItem(`pixel-${className}`) === "true";
    toggle.checked = enabled;
    applyPreference(className, enabled);
    toggle.addEventListener("change", () => applyPreference(className, toggle.checked));
});

function bindBooleanPreference(id, storageKey, apply) {
    const input = document.getElementById(id);
    if (!input) return;
    const value = localStorage.getItem(storageKey) !== "false";
    input.checked = value;
    apply(value);
    input.addEventListener("change", () => {
        localStorage.setItem(storageKey, input.checked);
        apply(input.checked);
    });
}

bindBooleanPreference("textureToggle", "pixel-texture", enabled => {
    document.body.classList.toggle("texture-disabled", !enabled);
});
const lightModeToggle = document.getElementById("lightModeToggle");
if (lightModeToggle) {
    // Dark is Pixel's default. Light mode is opt-in and persisted only after
    // the user intentionally enables it.
    const isLightMode = localStorage.getItem("pixel-light-mode") === "true";
    lightModeToggle.checked = isLightMode;
    document.body.classList.toggle("light-mode", isLightMode);
    lightModeToggle.addEventListener("change", () => {
        localStorage.setItem("pixel-light-mode", lightModeToggle.checked);
        document.body.classList.toggle("light-mode", lightModeToggle.checked);
    });
}
bindBooleanPreference("sendWithEnterToggle", "pixel-send-with-enter", () => {});
bindBooleanPreference("autoScrollToggle", "pixel-auto-scroll", () => {});
bindBooleanPreference("responseActionsToggle", "pixel-response-actions", enabled => {
    document.body.classList.toggle("response-actions-hidden", !enabled);
});

const responseWidthSelect = document.getElementById("responseWidthSelect");
if (responseWidthSelect) {
    const savedWidth = localStorage.getItem("pixel-response-width") || "900px";
    responseWidthSelect.value = savedWidth;
    document.documentElement.style.setProperty("--content-width", savedWidth);
    responseWidthSelect.addEventListener("change", () => {
        localStorage.setItem("pixel-response-width", responseWidthSelect.value);
        document.documentElement.style.setProperty("--content-width", responseWidthSelect.value);
    });
}

document.querySelectorAll(".settings-tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const target = tab.dataset.settingsTab;
        document.querySelectorAll(".settings-tab").forEach(item => item.classList.toggle("active", item === tab));
        document.querySelectorAll(".settings-page").forEach(page => page.classList.toggle("active", page.dataset.settingsPage === target));
    });
});

document.getElementById("openProfileSettingsBtn")?.addEventListener("click", () => openPanel("profilePanel"));
document.getElementById("logoutSettingsBtn")?.addEventListener("click", () => document.getElementById("logoutBtn")?.click());

document.getElementById("clearChatBtn")?.addEventListener("click", async () => {
    if (!currentConversation || !window.confirm("Clear all messages in this chat?")) return;
    const { error } = await uiClient.from("messages").delete().eq("conversation_id", currentConversation);
    if (!error) chatArea.innerHTML = "";
});

document.getElementById("chatSearchInput")?.addEventListener("input", event => {
    const query = event.target.value.trim().toLowerCase();
    const results = document.getElementById("searchResults");
    const conversations = [...document.querySelectorAll(".conversation-item")];
    results.innerHTML = "";
    conversations.filter(item => item.textContent.toLowerCase().includes(query)).forEach(item => {
        const result = document.createElement("button");
        result.type = "button";
        result.textContent = item.textContent;
        result.addEventListener("click", () => { item.click(); closePanels(); });
        results.appendChild(result);
    });
});

function hideContextMenu() { contextMenu.classList.remove("show"); contextConversation = null; }
document.addEventListener("contextmenu", event => {
    const item = event.target.closest(".conversation-item");
    if (!item) return hideContextMenu();
    event.preventDefault();
    contextConversation = { id: item.dataset.conversationId, title: item.dataset.conversationTitle };
    contextMenu.style.left = `${Math.min(event.clientX, window.innerWidth - 205)}px`;
    contextMenu.style.top = `${Math.min(event.clientY, window.innerHeight - 150)}px`;
    contextMenu.classList.add("show");
});
document.addEventListener("click", event => { if (!event.target.closest(".chat-context-menu")) hideContextMenu(); });

contextMenu?.addEventListener("click", async event => {
    const action = event.target.closest("button")?.dataset.chatAction;
    const target = contextConversation;
    hideContextMenu();
    if (!action || !target) return;
    if (action === "rename") {
        const title = window.prompt("Name this conversation", target.title)?.trim();
        if (title) await uiClient.from("conversations").update({ title: title.slice(0, 80) }).eq("id", target.id);
    }
    if (action === "pin") {
        const pinned = JSON.parse(localStorage.getItem("pixel-pinned-chats") || "[]");
        const next = pinned.includes(target.id) ? pinned.filter(id => id !== target.id) : [target.id, ...pinned];
        localStorage.setItem("pixel-pinned-chats", JSON.stringify(next));
    }
    if (action === "delete" && window.confirm(`Delete “${target.title}”? This cannot be undone.`)) {
        await uiClient.from("messages").delete().eq("conversation_id", target.id);
        await uiClient.from("conversations").delete().eq("id", target.id);
        if (currentConversation === target.id) newChat();
    }
    loadConversations();
});

loadProfile();
