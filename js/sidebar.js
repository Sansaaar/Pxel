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

}

function closeSidebar() {

    sidebar.classList.remove("expanded");

    if (overlay) {
        overlay.classList.remove("show");
    }

}

function toggleSidebar(){

    if(window.innerWidth <= 768){

        sidebar.classList.toggle("expanded");

        overlay.classList.toggle("show");

        return;

    }

    sidebar.classList.toggle("expanded");

}

// ------------------------------
// Events
// ------------------------------

menuBtn.addEventListener("click", toggleSidebar);

if (overlay) {

    overlay.addEventListener("click", closeSidebar);

}

// Close sidebar after selecting a chat on mobile

document.addEventListener("click", (e) => {

    if (window.innerWidth > 768) return;

    const clickedConversation =
        e.target.closest(".history-item");

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

// Resize

window.addEventListener("resize", () => {

    if (window.innerWidth > 768) {

        overlay?.classList.remove("show");

    }

});