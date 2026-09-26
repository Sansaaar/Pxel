// ==========================================
// Pixel AI 2.0: Artworks Portfolio Controller
// Handles gallery loading, filtering, search,
// centered interactive Lightbox viewer, pan/drag on zoom,
// mousewheel zoom, fullscreen toggle, & navigation
// ==========================================

(function () {
    let artworksList = [];
    let currentArtworkIndex = -1;
    let currentZoomScale = 1;
    let translateX = 0;
    let translateY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    // Elements
    const galleryGrid = document.getElementById("artworksGrid");
    const searchInput = document.getElementById("artworksSearchInput");
    const filterSelect = document.getElementById("artworksFilterSelect");

    // Modal elements
    const modal = document.getElementById("artworksModal");
    const imageContainer = modal ? modal.querySelector(".artwork-lightbox-image-container") : null;
    const modalImg = document.getElementById("artworksModalImg");
    const modalTitle = document.getElementById("artworksModalTitle");
    const modalDesc = document.getElementById("artworksModalDesc");
    const modalCategory = document.getElementById("artworksModalCategory");
    const modalSoftware = document.getElementById("artworksModalSoftware");
    const modalDate = document.getElementById("artworksModalDate");
    const prevBtn = document.getElementById("artworksPrevBtn");
    const nextBtn = document.getElementById("artworksNextBtn");
    const imgPrevBtn = document.getElementById("artworksImgPrevBtn");
    const imgNextBtn = document.getElementById("artworksImgNextBtn");
    const closeBtn = document.getElementById("artworksCloseBtn");
    const zoomInBtn = document.getElementById("artworksZoomIn");
    const zoomOutBtn = document.getElementById("artworksZoomOut");
    const zoomResetBtn = document.getElementById("artworksZoomReset");
    const fullscreenBtn = document.getElementById("artworksFullscreenBtn");

    async function loadArtworks() {
        if (!galleryGrid) return;

        galleryGrid.innerHTML = `
            <div class="artworks-loading-state" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--gold);"></i>
                <p style="margin-top: 12px;">Loading gallery collection...</p>
            </div>
        `;

        try {
            const apiBase = (window.API_BASE || "").replace(/\/$/, "");
            let res = await fetch(`${apiBase}/artworks.json`, { cache: "no-cache" });
            if (!res.ok) {
                res = await fetch(`${apiBase}/api/artworks`, { cache: "no-cache" });
            }
            if (!res.ok) throw new Error(`Artwork list request failed (${res.status})`);
            const data = await res.json();

            if (Array.isArray(data.artworks)) {
                artworksList = data.artworks
                    .filter(item => item && typeof item.filename === "string" && item.filename.trim())
                    .map((item, index) => {
                        const filename = item.filename.trim();
                        return {
                            id: `art-${index + 1}-${filename}`,
                            filename,
                            url: `${apiBase}/artworks/${encodeURIComponent(filename)}`,
                            title: typeof item.title === "string" && item.title.trim() ? item.title : filename,
                            description: item.description || null,
                            category: item.category || null,
                            software: item.software || null,
                            date: item.date || null
                        };
                    });
                populateCategoriesFilter(artworksList);
                renderGallery();
            } else {
                artworksList = [];
                populateCategoriesFilter(artworksList);
                showEmptyState("No artworks found.");
            }
        } catch (err) {
            console.error("[Artworks] Load error:", err);
            showEmptyState("Unable to load artworks right now. Please try again later.");
        }
    }

    function populateCategoriesFilter(items) {
        if (!filterSelect) return;

        const categories = new Set();
        items.forEach(item => {
            if (item.category) categories.add(item.category);
        });

        filterSelect.innerHTML = `<option value="all">All Categories</option>`;
        categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat;
            opt.textContent = cat;
            filterSelect.appendChild(opt);
        });
    }

    function getFilteredArtworks() {
        const query = (searchInput?.value || "").trim().toLowerCase();
        const category = filterSelect?.value || "all";

        return artworksList.filter(item => {
            const matchSearch = !query || 
                item.title.toLowerCase().includes(query) ||
                (item.description && item.description.toLowerCase().includes(query)) ||
                (item.category && item.category.toLowerCase().includes(query));

            const matchCategory = category === "all" || item.category === category;

            return matchSearch && matchCategory;
        });
    }

    function renderGallery() {
        const items = getFilteredArtworks();
        if (!galleryGrid) return;

        if (items.length === 0) {
            showEmptyState("No matching artworks found.");
            return;
        }

        galleryGrid.innerHTML = "";
        items.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "artwork-card";
            card.dataset.index = index;

            let html = `
                <div class="artwork-card-thumb-wrap">
                    <img class="artwork-card-thumb" src="${esc(item.url)}" alt="${esc(item.title)}" loading="lazy" />
                    <div class="artwork-card-hover-overlay">
                        <div class="artwork-zoom-icon"><i class="fa-solid fa-expand"></i></div>
                    </div>
                </div>
                <div class="artwork-card-content">
            `;

            if (item.category) {
                html += `<span class="artwork-card-category">${esc(item.category)}</span>`;
            }

            html += `<h3 class="artwork-card-title">${esc(item.title)}</h3>`;

            if (item.description) {
                html += `<p class="artwork-card-desc">${esc(item.description)}</p>`;
            }

            html += `
                <div class="artwork-card-meta">
                    ${item.software ? `<span><i class="fa-solid fa-wand-magic-sparkles"></i> ${esc(item.software)}</span>` : "<span></span>"}
                    ${item.date ? `<span>${esc(item.date)}</span>` : ""}
                </div>
            </div>`;

            card.innerHTML = html;

            card.addEventListener("click", () => {
                openLightbox(index, items);
            });

            galleryGrid.appendChild(card);
        });
    }

    function showEmptyState(msg) {
        if (!galleryGrid) return;
        galleryGrid.innerHTML = `
            <div class="artworks-empty-state" style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-secondary);">
                <i class="fa-regular fa-image" style="font-size: 40px; color: var(--gold); margin-bottom: 16px;"></i>
                <p style="font-size: 16px;">${esc(msg)}</p>
            </div>
        `;
    }

    function openLightbox(index, currentSet) {
        const activeItems = currentSet || getFilteredArtworks();
        if (index < 0 || index >= activeItems.length || !modal) return;

        currentArtworkIndex = index;
        const item = activeItems[index];

        if (modalImg) {
            modalImg.src = item.url;
            setZoom(1.0, true);
        }

        if (modalTitle) modalTitle.textContent = item.title || "Artwork";
        
        if (modalDesc) {
            if (item.description) {
                modalDesc.textContent = item.description;
                modalDesc.parentElement.style.display = "flex";
            } else {
                modalDesc.parentElement.style.display = "none";
            }
        }

        if (modalCategory) {
            if (item.category) {
                modalCategory.textContent = item.category;
                modalCategory.parentElement.style.display = "flex";
            } else {
                modalCategory.parentElement.style.display = "none";
            }
        }

        if (modalSoftware) {
            if (item.software) {
                modalSoftware.textContent = item.software;
                modalSoftware.parentElement.style.display = "flex";
            } else {
                modalSoftware.parentElement.style.display = "none";
            }
        }

        if (modalDate) {
            if (item.date) {
                modalDate.textContent = item.date;
                modalDate.parentElement.style.display = "flex";
            } else {
                modalDate.parentElement.style.display = "none";
            }
        }

        // Update nav buttons
        const isFirst = index === 0;
        const isLast = index === activeItems.length - 1;
        if (prevBtn) prevBtn.disabled = isFirst;
        if (nextBtn) nextBtn.disabled = isLast;
        if (imgPrevBtn) imgPrevBtn.style.opacity = isFirst ? "0.3" : "1";
        if (imgNextBtn) imgNextBtn.style.opacity = isLast ? "0.3" : "1";

        if (!modal.open) {
            modal.showModal();
            document.body.style.overflow = "hidden";
        }
    }

    function closeLightbox() {
        if (!modal || !modal.open) return;
        modal.close();
        document.body.style.overflow = "";
        setZoom(1.0, true);
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
    }

    function applyTransform() {
        if (!modalImg) return;
        modalImg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoomScale})`;
        if (imageContainer) {
            imageContainer.style.cursor = currentZoomScale > 1 ? (isDragging ? "grabbing" : "grab") : "default";
        }
    }

    function setZoom(scale, resetPosition = false) {
        currentZoomScale = Math.min(Math.max(scale, 0.5), 4.0);
        if (resetPosition || currentZoomScale <= 1.0) {
            translateX = 0;
            translateY = 0;
        }
        applyTransform();
    }

    function toggleFullscreen() {
        if (!modal) return;
        if (!document.fullscreenElement) {
            if (modal.requestFullscreen) {
                modal.requestFullscreen().catch(() => {
                    modal.classList.toggle("lightbox-fullscreen-fallback");
                });
            } else {
                modal.classList.toggle("lightbox-fullscreen-fallback");
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
            }
            modal.classList.remove("lightbox-fullscreen-fallback");
        }
    }

    function setupEventListeners() {
        if (searchInput) {
            searchInput.addEventListener("input", renderGallery);
        }
        if (filterSelect) {
            filterSelect.addEventListener("change", renderGallery);
        }

        if (closeBtn && modal) {
            closeBtn.addEventListener("click", closeLightbox);
            modal.addEventListener("click", (e) => {
                if (e.target === modal) closeLightbox();
            });
            modal.addEventListener("cancel", () => {
                document.body.style.overflow = "";
            });
        }

        const handlePrev = () => {
            const items = getFilteredArtworks();
            if (currentArtworkIndex > 0) {
                openLightbox(currentArtworkIndex - 1, items);
            }
        };

        const handleNext = () => {
            const items = getFilteredArtworks();
            if (currentArtworkIndex < items.length - 1) {
                openLightbox(currentArtworkIndex + 1, items);
            }
        };

        if (prevBtn) prevBtn.addEventListener("click", handlePrev);
        if (nextBtn) nextBtn.addEventListener("click", handleNext);
        if (imgPrevBtn) imgPrevBtn.addEventListener("click", handlePrev);
        if (imgNextBtn) imgNextBtn.addEventListener("click", handleNext);

        // Zoom controls
        if (zoomInBtn) {
            zoomInBtn.addEventListener("click", () => setZoom(currentZoomScale + 0.3));
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener("click", () => setZoom(currentZoomScale - 0.3));
        }
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener("click", () => setZoom(1.0, true));
        }
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener("click", toggleFullscreen);
        }

        // Mousewheel zoom on image container
        if (imageContainer) {
            imageContainer.addEventListener("wheel", (e) => {
                if (!modal || !modal.open) return;
                e.preventDefault();
                const delta = e.deltaY < 0 ? 0.2 : -0.2;
                setZoom(currentZoomScale + delta, false);
            }, { passive: false });

            // Pan / Dragging when zoomed in
            imageContainer.addEventListener("mousedown", (e) => {
                if (currentZoomScale <= 1.0 || e.target.closest("button")) return;
                isDragging = true;
                startX = e.clientX - translateX;
                startY = e.clientY - translateY;
                imageContainer.style.cursor = "grabbing";
                e.preventDefault();
            });

            window.addEventListener("mousemove", (e) => {
                if (!isDragging) return;
                const maxPanX = modalImg ? (modalImg.offsetWidth * currentZoomScale) * 0.75 : 400;
                const maxPanY = modalImg ? (modalImg.offsetHeight * currentZoomScale) * 0.75 : 400;
                translateX = Math.max(-maxPanX, Math.min(maxPanX, e.clientX - startX));
                translateY = Math.max(-maxPanY, Math.min(maxPanY, e.clientY - startY));
                applyTransform();
            });

            window.addEventListener("mouseup", () => {
                if (isDragging) {
                    isDragging = false;
                    applyTransform();
                }
            });

            // Touch drag support
            imageContainer.addEventListener("touchstart", (e) => {
                if (currentZoomScale <= 1.0 || e.touches.length !== 1 || e.target.closest("button")) return;
                isDragging = true;
                startX = e.touches[0].clientX - translateX;
                startY = e.touches[0].clientY - translateY;
            }, { passive: true });

            window.addEventListener("touchmove", (e) => {
                if (!isDragging || e.touches.length !== 1) return;
                const maxPanX = modalImg ? (modalImg.offsetWidth * currentZoomScale) * 0.75 : 400;
                const maxPanY = modalImg ? (modalImg.offsetHeight * currentZoomScale) * 0.75 : 400;
                translateX = Math.max(-maxPanX, Math.min(maxPanX, e.touches[0].clientX - startX));
                translateY = Math.max(-maxPanY, Math.min(maxPanY, e.touches[0].clientY - startY));
                applyTransform();
            }, { passive: true });

            window.addEventListener("touchend", () => {
                if (isDragging) {
                    isDragging = false;
                    applyTransform();
                }
            });
        }

        // Keyboard arrow navigation & Escape
        document.addEventListener("keydown", (e) => {
            if (!modal || !modal.open) return;

            if (e.key === "ArrowLeft") {
                handlePrev();
            } else if (e.key === "ArrowRight") {
                handleNext();
            } else if (e.key === "Escape") {
                closeLightbox();
            }
        });
    }

    function esc(str) {
        if (!str) return "";
        const d = document.createElement("div");
        d.textContent = str;
        return d.innerHTML;
    }

    window.openArtworkViewer = function (url, title = "Artwork Preview") {
        if (!modal || !modalImg) return;
        currentArtworkIndex = -1;
        modalImg.src = url;
        if (modalTitle) modalTitle.textContent = title;
        if (modalDesc && modalDesc.parentElement) modalDesc.parentElement.style.display = "none";
        if (modalCategory && modalCategory.parentElement) modalCategory.parentElement.style.display = "none";
        if (modalSoftware && modalSoftware.parentElement) modalSoftware.parentElement.style.display = "none";
        if (modalDate && modalDate.parentElement) modalDate.parentElement.style.display = "none";
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        if (imgPrevBtn) imgPrevBtn.style.opacity = "0";
        if (imgNextBtn) imgNextBtn.style.opacity = "0";
        setZoom(1.0, true);
        if (!modal.open) {
            modal.showModal();
            document.body.classList.add("modal-open");
        }
    };

    window.addEventListener("DOMContentLoaded", () => {
        setupEventListeners();
    });

    window.loadArtworksGallery = loadArtworks;
})();
