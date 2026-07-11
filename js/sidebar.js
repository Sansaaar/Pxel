// ==========================================
// Pixel Sidebar
// ==========================================

const sidebar = document.getElementById("sidebar");
const menuBtn = document.getElementById("menuBtn");
const overlay = document.getElementById("sidebarOverlay");

// ------------------------------
// Toggle Sidebar
// ------------------------------

function openSidebar() {

    sidebar.classList.add("expanded");

    if (overlay) {
        overlay.classList.add("show");
    }

    // Marks <body> so CSS can disable pointer-events on everything in
    // .main while the mobile sidebar is open. This guarantees taps can't
    // "leak through" to buttons behind the overlay, regardless of z-index.
    if (window.innerWidth <= 768) {
        document.body.classList.add("sidebar-open");
    }

}

function closeSidebar() {

    sidebar.classList.remove("expanded");

    if (overlay) {
        overlay.classList.remove("show");
    }

    document.body.classList.remove("sidebar-open");

}

function toggleSidebar() {

    const isOpen = sidebar.classList.contains("expanded");

    if (isOpen) {
        closeSidebar();
    } else {
        openSidebar();
    }

}

// ------------------------------
// Events
// ------------------------------

menuBtn.addEventListener("click", toggleSidebar);

// Tap outside the sidebar (anywhere on the overlay) closes it on mobile.
if (overlay) {
    overlay.addEventListener("click", closeSidebar);
}

// Close sidebar after selecting a chat on mobile.
// NOTE: chat entries use the ".conversation-item" class (see index.html /
// styles2.css) — this used to look for ".history-item", which doesn't
// exist anywhere, so the sidebar never closed after picking a chat.
document.addEventListener("click", (e) => {

    if (window.innerWidth > 768) return;

    const clickedConversation = e.target.closest(".conversation-item");

    if (clickedConversation) {

        closeSidebar();

    }

});

// Escape key

document.addEventListener("keydown", (e) => {

    if (e.key === "Escape") {

        closeSidebar();

    }

});

// Resize — if the viewport grows past mobile breakpoint while the sidebar
// is open, drop the overlay so desktop layout isn't left in a broken state.

window.addEventListener("resize", () => {

    if (window.innerWidth > 768) {

        overlay?.classList.remove("show");
        document.body.classList.remove("sidebar-open");

    }

});