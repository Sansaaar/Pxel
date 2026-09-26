(function () {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let lastHeight = 0;

    function syncViewportHeight() {
        const height = viewport ? viewport.height : window.innerHeight;

        if (!height || Math.abs(height - lastHeight) < 1) return;
        lastHeight = height;
        root.style.setProperty("--app-viewport-height", `${Math.round(height)}px`);
    }

    syncViewportHeight();
    window.addEventListener("resize", syncViewportHeight, { passive: true });
    window.addEventListener("orientationchange", () => window.setTimeout(syncViewportHeight, 150), { passive: true });

    if (viewport) {
        viewport.addEventListener("resize", syncViewportHeight, { passive: true });
        viewport.addEventListener("scroll", syncViewportHeight, { passive: true });
    }
})();
