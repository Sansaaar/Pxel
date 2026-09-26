(function () {
    const groups = {
        workspaceThinkGrid: [
            { title: "Chat", description: "AI conversations", icon: "fa-regular fa-message", tone: "gold", action: "chat" },
            { title: "Research", description: "Research topics", icon: "fa-solid fa-magnifying-glass-chart", tone: "blue" },
            { title: "Agents", description: "AI assistants", icon: "fa-solid fa-robot", tone: "sage" },
            { title: "Models", description: "Choose an AI model", icon: "fa-solid fa-cubes", tone: "rose", action: "models" }
        ],
        workspaceCreateGrid: [
            { title: "Canvas", description: "Creative canvas", icon: "fa-solid fa-shapes", tone: "rose" },
            { title: "Whiteboard", description: "Draw and brainstorm", icon: "fa-solid fa-pen-ruler", tone: "gold", action: "whiteboard" },
            { title: "Image Studio", description: "Create and edit", icon: "fa-regular fa-image", tone: "blue" },
            { title: "Storyboard", description: "Plan scenes", icon: "fa-solid fa-film", tone: "sage" }
        ],
        workspaceWorkGrid: [
            { title: "Projects", description: "Organize work", icon: "fa-regular fa-folder-open", tone: "gold" },
            { title: "Files", description: "Your documents", icon: "fa-regular fa-file-lines", tone: "sage" },
            { title: "Code", description: "Build and debug", icon: "fa-solid fa-code", tone: "blue" },
            { title: "Data", description: "Analyze data", icon: "fa-solid fa-chart-column", tone: "rose" }
        ],
        workspaceNotesGrid: [
            { title: "Notes", description: "Capture ideas and information", icon: "fa-regular fa-note-sticky", tone: "gold" }
        ]
    };

    function createToolCard(tool) {
        const button = document.createElement("button");
        button.className = "workspace-tool-card";
        button.type = "button";
        button.dataset.tone = tool.tone;
        if (tool.action) button.dataset.action = tool.action;
        else {
            button.disabled = true;
            button.title = `${tool.title} is coming soon`;
        }

        const icon = document.createElement("span");
        icon.className = "workspace-tool-icon";
        icon.setAttribute("aria-hidden", "true");
        const glyph = document.createElement("i");
        glyph.className = tool.icon;
        icon.append(glyph);

        const copy = document.createElement("span");
        copy.className = "workspace-tool-copy";
        const title = document.createElement("strong");
        title.textContent = tool.title;
        const description = document.createElement("small");
        description.textContent = tool.description;
        copy.append(title, description);
        button.append(icon, copy);

        const state = document.createElement("small");
        if (tool.action) {
            state.className = "workspace-tool-state";
            state.textContent = "Open";
        } else {
            state.className = "workspace-tool-state";
            state.textContent = "Coming soon";
        }
        button.append(state);
        return button;
    }

    function renderTools() {
        for (const [containerId, tools] of Object.entries(groups)) {
            const container = document.getElementById(containerId);
            if (container) container.replaceChildren(...tools.map(createToolCard));
        }
    }

    function setNewMenu(open) {
        const button = document.getElementById("workspaceNewBtn");
        const menu = document.getElementById("workspaceNewMenu");
        if (!button || !menu) return;
        button.setAttribute("aria-expanded", String(open));
        menu.hidden = !open;
    }

    function activateAction(action) {
        setNewMenu(false);
        if (action === "chat") {
            window.switchAppView?.("aiChat");
        } else if (action === "models") {
            window.switchAppView?.("aiChat");
            window.setTimeout(() => document.getElementById("topModelPill")?.click(), 0);
        } else if (action === "whiteboard") {
            window.openPixelWhiteboard?.({ route: true });
        } else if (action === "new-chat") {
            window.switchAppView?.("aiChat");
            window.newChat?.();
        } else if (action === "new-whiteboard") {
            window.openPixelWhiteboard?.({
                route: true,
                createNew: true,
                returnFocus: document.getElementById("workspaceNewBtn")
            });
        }
    }

    let recentRequest = 0;

    function relativeTime(value) {
        const timestamp = Date.parse(value || "");
        if (!Number.isFinite(timestamp)) return "Recently";
        const elapsed = Math.max(0, Date.now() - timestamp);
        const minutes = Math.floor(elapsed / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
        if (hours < 48) return "Yesterday";
        return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(timestamp);
    }

    function renderRecentItem(item) {
        const button = document.createElement("button");
        button.className = "workspace-recent-item";
        button.type = "button";
        button.addEventListener("click", () => {
            if (item.type === "whiteboard") {
                window.openPixelWhiteboard?.({ route: true, boardId: item.id });
            } else {
                window.switchAppView?.("aiChat");
                window.openPixelConversation?.(item.id);
            }
        });

        const icon = document.createElement("i");
        icon.className = item.type === "whiteboard" ? "fa-solid fa-pen-ruler" : "fa-regular fa-message";
        icon.setAttribute("aria-hidden", "true");
        const copy = document.createElement("span");
        copy.className = "workspace-recent-copy";
        const title = document.createElement("strong");
        title.textContent = item.title || "Untitled";
        const detail = document.createElement("small");
        detail.textContent = item.type === "whiteboard" ? "Whiteboard" : "AI chat";
        copy.append(title, detail);
        const time = document.createElement("span");
        time.className = "workspace-recent-time";
        time.textContent = relativeTime(item.updated_at || item.created_at);
        const arrow = document.createElement("i");
        arrow.className = "fa-solid fa-arrow-up-right-from-square";
        arrow.setAttribute("aria-hidden", "true");
        button.append(icon, copy, time, arrow);
        return button;
    }

    async function loadRecent() {
        const container = document.getElementById("workspaceRecentList");
        if (!container) return;
        const request = ++recentRequest;
        const conversations = window.getPixelRecentConversations?.() || [];
        let whiteboards = [];
        try {
            whiteboards = await window.getPixelWhiteboardRecents?.() || [];
        } catch (error) {
            console.warn("[Pixel Workspace] Recent whiteboards are unavailable.", error);
        }
        if (request !== recentRequest) return;
        const recent = [
            ...conversations.map(item => ({ ...item, type: "chat" })),
            ...whiteboards.map(item => ({ ...item, type: "whiteboard" }))
        ].sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0)).slice(0, 6);

        if (!recent.length) {
            const empty = document.createElement("p");
            empty.className = "workspace-recent-empty";
            empty.textContent = "Recent chats and whiteboards will appear here.";
            container.replaceChildren(empty);
            return;
        }
        container.replaceChildren(...recent.map(renderRecentItem));
    }

    function initialize() {
        renderTools();
        loadRecent();
        window.loadWorkspaceRecent = loadRecent;

        const newButton = document.getElementById("workspaceNewBtn");
        newButton?.addEventListener("click", () => {
            setNewMenu(newButton.getAttribute("aria-expanded") !== "true");
        });

        document.getElementById("workspaceNewMenu")?.addEventListener("click", event => {
            const action = event.target.closest?.("[data-workspace-action]")?.dataset.workspaceAction;
            if (action) activateAction(action);
        });

        document.getElementById("workspaceView")?.addEventListener("click", event => {
            const card = event.target.closest?.(".workspace-tool-card[data-action]");
            if (card && !card.disabled) activateAction(card.dataset.action);
        });

        document.addEventListener("click", event => {
            if (!event.target.closest?.(".workspace-new-wrap")) setNewMenu(false);
        });

        document.addEventListener("keydown", event => {
            if (event.key === "Escape" && document.getElementById("workspaceNewBtn")?.getAttribute("aria-expanded") === "true") {
                setNewMenu(false);
                document.getElementById("workspaceNewBtn")?.focus({ preventScroll: true });
            }
        });
    }

    if (document.readyState === "loading") {
        window.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
})();
