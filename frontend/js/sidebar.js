// ==========================================
// Pixel AI 2.0: Sidebar & Mobile Drawer Manager
// Handles view switching (AI Chat, Artworks, User Chat, Workspace)
// ==========================================

(function() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const searchInput = document.getElementById("sidebarSearchInput");

    function isWorkspacePath(pathname = window.location.pathname) {
        return pathname === "/workspace" || pathname.startsWith("/workspace/");
    }

    function routeForLocation() {
        if (isWorkspacePath()) return "workspace";
        if (window.location.hash === "#artworks") return "artworks";
        if (window.location.hash === "#chat") return "userChat";
        return "aiChat";
    }

    function isMobile() {
        return window.innerWidth <= 840;
    }

    function openSidebar() {
        if (!sidebar) return;
        sidebar.classList.add("expanded");
        if (overlay) overlay.classList.add("show");
        if (isMobile()) {
            document.body.classList.add("sidebar-open");
        }
    }

    function closeSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove("expanded");
        if (overlay) overlay.classList.remove("show");
        document.body.classList.remove("sidebar-open");
    }

    function toggleSidebar() {
        if (!sidebar) return;
        if (sidebar.classList.contains("expanded")) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function switchView(targetView, options = {}) {
        const aiView = document.getElementById("aiChatView");
        const artworksView = document.getElementById("artworksView");
        const userChatView = document.getElementById("userChatView");
        const workspaceView = document.getElementById("workspaceView");
        const workspaceBtn = document.getElementById("workspaceBtn");

        if (aiView) aiView.classList.toggle("active", targetView === "aiChat");
        if (artworksView) artworksView.classList.toggle("active", targetView === "artworks");
        if (userChatView) userChatView.classList.toggle("active", targetView === "userChat");
        if (workspaceView) workspaceView.classList.toggle("active", targetView === "workspace");
        if (workspaceBtn) {
            workspaceBtn.classList.toggle("is-active", targetView === "workspace");
            if (targetView === "workspace") workspaceBtn.setAttribute("aria-current", "page");
            else workspaceBtn.removeAttribute("aria-current");
        }

        if (options.syncLocation !== false) {
            const currentPath = window.location.pathname;
            if (targetView === "workspace" && !isWorkspacePath(currentPath)) {
                window.history.pushState({ pixelView: "workspace" }, "", "/workspace");
            } else if (targetView !== "workspace" && isWorkspacePath(currentPath)) {
                const destination = targetView === "artworks" ? "/#artworks"
                    : targetView === "userChat" ? "/#chat" : "/";
                window.history.pushState({ pixelView: targetView }, "", destination);
            }
        }

        if (targetView === "artworks" && typeof window.loadArtworksGallery === "function") {
            window.loadArtworksGallery();
        } else if (targetView === "userChat" && typeof window.loadUserChatSystem === "function") {
            window.loadUserChatSystem();
        } else if (targetView === "workspace") {
            window.loadWorkspaceRecent?.();
        }

        if (isMobile()) {
            closeSidebar();
        }
    }

    // Live search inside conversation list
    function filterConversations(query) {
        const q = (query || "").trim().toLowerCase();
        const items = document.querySelectorAll(".conversation-item");
        let matchesCount = 0;

        items.forEach(item => {
            const title = item.dataset.conversationTitle?.toLowerCase() || item.textContent.toLowerCase();
            const match = !q || title.includes(q);
            item.style.display = match ? "flex" : "none";
            if (match) matchesCount++;
        });

        // Hide date group headers if all items in that group are hidden
        ["today", "yesterday", "week", "month"].forEach(g => {
            const group = document.getElementById(g + "Group");
            const list = document.getElementById(g + "List");
            if (group && list) {
                const visible = Array.from(list.children).some(child => child.style.display !== "none");
                group.style.display = visible ? "block" : "none";
            }
        });
    }

    window.addEventListener("DOMContentLoaded", () => {
        // Navigation buttons
        const newChatBtn = document.getElementById("newChatBtn");
        const topNewChatBtn = document.getElementById("topNewChatBtn");
        const artworksBtn = document.getElementById("artworksBtn");
        const userChatBtn = document.getElementById("userChatBtn");
        const creatorBtn = document.getElementById("creatorBtn");
        const workspaceBtn = document.getElementById("workspaceBtn");
        const moreSection = document.getElementById("sidebarMoreSection");
        const moreToggleBtn = document.getElementById("moreToggleBtn");
        const moreMenu = document.getElementById("sidebarMoreMenu");
        const moreDataBtn = document.getElementById("moreDataBtn");

        if (newChatBtn) {
            newChatBtn.addEventListener("click", () => {
                switchView("aiChat");
                if (typeof window.startNewConversation === "function") {
                    window.startNewConversation();
                }
            });
        }

        if (topNewChatBtn) {
            topNewChatBtn.addEventListener("click", () => {
                switchView("aiChat");
                if (typeof window.startNewConversation === "function") {
                    window.startNewConversation();
                }
            });
        }

        if (artworksBtn) {
            artworksBtn.addEventListener("click", () => {
                switchView("artworks");
            });
        }

        if (userChatBtn) {
            userChatBtn.addEventListener("click", () => {
                switchView("userChat");
            });
        }

        if (creatorBtn) {
            creatorBtn.addEventListener("click", () => {
                window.location.href = "creator.html";
            });
        }

        workspaceBtn?.addEventListener("click", () => switchView("workspace"));

        if (moreToggleBtn && moreSection && moreMenu) {
            moreToggleBtn.addEventListener("click", () => {
                const expanded = moreToggleBtn.getAttribute("aria-expanded") !== "true";
                moreToggleBtn.setAttribute("aria-expanded", String(expanded));
                moreMenu.setAttribute("aria-hidden", String(!expanded));
                moreMenu.inert = !expanded;
                moreMenu.querySelectorAll(".sidebar-more-item:not(:disabled)").forEach(item => {
                    item.tabIndex = expanded ? 0 : -1;
                });
                moreSection.classList.toggle("is-open", expanded);
            });
        }

        if (moreDataBtn) {
            moreDataBtn.addEventListener("click", () => {
                if (isMobile()) closeSidebar();
                window.openPixelSettings?.();
                document.querySelector('[data-settings-tab="data"]')?.click();
            });
        }

        // Toggle buttons (sidebar header & top bar)
        document.querySelectorAll(".sidebar-toggle-btn, #menuBtn").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleSidebar();
            });
        });

        if (overlay) {
            overlay.addEventListener("click", closeSidebar);
        }

        // Close on mobile when selecting a chat
        document.addEventListener("click", (e) => {
            if (isMobile() && e.target.closest(".conversation-item") && !e.target.closest(".item-menu-btn")) {
                switchView("aiChat");
                closeSidebar();
            }
        });

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && sidebar?.classList.contains("expanded")) {
                closeSidebar();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "b") {
                e.preventDefault();
                toggleSidebar();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                switchView("aiChat");
                if (newChatBtn) newChatBtn.click();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "c") {
                e.preventDefault();
                window.location.href = "creator.html";
            }
            if ((e.ctrlKey || e.metaKey) && e.key === ",") {
                e.preventDefault();
                if (typeof window.openPixelSettings === "function") {
                    window.openPixelSettings();
                }
            }
        });

        // Sidebar live search input
        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                filterConversations(e.target.value);
            });
        }

        // Auto-handle resize
        window.addEventListener("resize", () => {
            if (!isMobile()) {
                if (overlay) overlay.classList.remove("show");
                document.body.classList.remove("sidebar-open");
            }
        });

        switchView(routeForLocation(), { syncLocation: false });
        window.addEventListener("popstate", () => {
            switchView(routeForLocation(), { syncLocation: false });
        });
    });

    window.openSidebar = openSidebar;
    window.closeSidebar = closeSidebar;
    window.toggleSidebar = toggleSidebar;
    window.switchAppView = switchView;
})();
