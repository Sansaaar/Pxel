// ==========================================
// Pixel AI 2.0: Enhanced Creator Page Controller
// ==========================================
// Handles:
//   - Back navigation & Escape keyboard listener
//   - Dynamic data loading from creatorData.json
//   - Section population (About, Pixel AI, Projects,
//     Animation, Artwork, Websites, Socials, Public Work)
//   - Interactive Artwork Lightbox Modal
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    // ── Navigation & Keyboard Controls ───────
    const backBtn = document.getElementById("backBtn");
    if (backBtn) {
        backBtn.addEventListener("click", () => {
            window.location.href = "index.html";
        });
    }

    // Escape shortcut to exit back to chat
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const artModal = document.getElementById("artModal");
            if (artModal && artModal.open) {
                artModal.close();
            } else {
                window.location.href = "index.html";
            }
        }
    });

    // Lightbox modal close listeners
    const artModal = document.getElementById("artModal");
    const artModalClose = document.getElementById("artModalClose");
    if (artModalClose && artModal) {
        artModalClose.addEventListener("click", () => artModal.close());
        artModal.addEventListener("click", (e) => {
            if (e.target === artModal) artModal.close();
        });
    }

    // ── Load & Render Creator Data ───────────
    fetch("data/creatorData.json")
        .then(res => {
            if (!res.ok) throw new Error("Failed to load creatorData.json");
            return res.json();
        })
        .then(data => {
            renderAbout(data.about);
            renderCards("pixelGrid",      data.pixelAI,    "pixel-card");
            renderCards("projectsGrid",   data.projects,   "project-card");
            renderCards("animationGrid",  data.animation,  "animation-card");
            renderArtwork("artworkGrid",  data.artwork);
            renderCards("websitesGrid",   data.websites,   "website-card");
            renderSocials("socialsGrid",  data.socials);
            renderCards("publicWorkGrid", data.publicWork,  "public-work-card");
        })
        .catch(err => {
            console.error("[Creator Page] Data fetch error:", err);
        });


    // ── Render Helpers ───────────────────────

    function renderAbout(text) {
        const el = document.getElementById("aboutText");
        if (el && text) el.textContent = text;
    }

    function renderCards(containerId, items, cardClass) {
        const container = document.getElementById(containerId);
        if (!container || !Array.isArray(items) || items.length === 0) {
            if (container) container.innerHTML = '<p class="empty-section-msg">Content coming soon.</p>';
            return;
        }

        container.innerHTML = "";
        items.forEach(item => {
            const card = document.createElement("div");
            card.className = cardClass;

            let html = "";
            if (item.category) {
                html += `<span class="card-category">${esc(item.category)}</span>`;
            }

            html += `<h3>${esc(item.title)}</h3>`;

            if (item.description) {
                html += `<p>${esc(item.description)}</p>`;
            }

            const hasRealUrl = item.url && item.url !== "#";
            html += `
                <div class="card-footer">
                    <a class="card-link${hasRealUrl ? "" : " disabled"}" 
                       href="${hasRealUrl ? esc(item.url) : "#"}" 
                       ${hasRealUrl ? 'target="_blank" rel="noopener noreferrer"' : 'onclick="return false;"'}>
                        <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        <span>${hasRealUrl ? "Open Resource" : "Link Pending"}</span>
                    </a>
                </div>
            `;

            card.innerHTML = html;
            container.appendChild(card);
        });
    }

    function renderArtwork(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container || !Array.isArray(items) || items.length === 0) {
            if (container) container.innerHTML = '<p class="empty-section-msg">Artwork coming soon.</p>';
            return;
        }

        container.innerHTML = "";
        items.forEach(item => {
            const card = document.createElement("div");
            card.className = "artwork-card";

            let html = "";
            const hasRealImage = item.imageUrl && item.imageUrl !== "#";

            html += `
                <div class="artwork-thumb-wrap" ${hasRealImage ? `data-fullimg="${esc(item.imageUrl)}" data-title="${esc(item.title)}" data-desc="${esc(item.description || "")}"` : ""}>
                    ${hasRealImage 
                        ? `<img class="artwork-thumb" src="${esc(item.imageUrl)}" alt="${esc(item.title)}" loading="lazy" />`
                        : `<div class="artwork-placeholder-icon"><i class="fa-regular fa-image"></i></div>`}
                </div>
            `;

            if (item.category) {
                html += `<span class="card-category">${esc(item.category)}</span>`;
            }

            html += `<h3>${esc(item.title)}</h3>`;

            if (item.description) {
                html += `<p>${esc(item.description)}</p>`;
            }

            html += `
                <div class="card-footer">
                    ${item.date ? `<span class="artwork-date">${esc(item.date)}</span>` : "<span></span>"}
                    <a class="card-link${hasRealImage ? "" : " disabled"}" 
                       href="${hasRealImage ? esc(item.imageUrl) : "#"}" 
                       ${hasRealImage ? 'target="_blank" rel="noopener noreferrer"' : 'onclick="return false;"'}>
                        <i class="fa-solid fa-expand"></i>
                        <span>${hasRealImage ? "View Full" : "Image Pending"}</span>
                    </a>
                </div>
            `;

            card.innerHTML = html;

            // Wire lightbox trigger if real image
            if (hasRealImage) {
                const wrap = card.querySelector(".artwork-thumb-wrap");
                if (wrap) {
                    wrap.addEventListener("click", () => {
                        openLightbox(item.imageUrl, item.title, item.description);
                    });
                }
            }

            container.appendChild(card);
        });
    }

    function renderSocials(containerId, items) {
        const container = document.getElementById(containerId);
        if (!container || !Array.isArray(items) || items.length === 0) {
            if (container) container.innerHTML = '<p class="empty-section-msg">Social links coming soon.</p>';
            return;
        }

        container.innerHTML = "";
        items.forEach(item => {
            const hasRealUrl = item.url && item.url !== "#";
            const link = document.createElement("a");
            link.className = `social-card${hasRealUrl ? "" : " disabled"}`;
            link.href = hasRealUrl ? item.url : "#";

            if (hasRealUrl) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
            } else {
                link.onclick = (e) => e.preventDefault();
            }

            const colorClass = item.colorClass || "default";
            const iconClass  = item.icon || "fa-solid fa-link";

            link.innerHTML = `
                <div class="social-icon ${esc(colorClass)}">
                    <i class="${esc(iconClass)}"></i>
                </div>
                <div class="social-info">
                    <span class="social-platform">${esc(item.platform)}</span>
                    <span class="social-handle">${item.handle ? esc(item.handle) : (hasRealUrl ? "Connect" : "Pending")}</span>
                </div>
            `;

            container.appendChild(link);
        });
    }

    function openLightbox(imgUrl, title, desc) {
        const modal = document.getElementById("artModal");
        const modalImg = document.getElementById("artModalImg");
        const modalTitle = document.getElementById("artModalTitle");
        const modalDesc = document.getElementById("artModalDesc");

        if (!modal || !modalImg) return;

        modalImg.src = imgUrl;
        if (modalTitle) modalTitle.textContent = title || "Artwork";
        if (modalDesc) modalDesc.textContent = desc || "";

        modal.showModal();
    }

    function esc(str) {
        if (!str) return "";
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }
});
