(function () {
    const loader = document.getElementById("pixel-loader");
    if (!loader) return;

    function dismissLoader() {
        if (!loader.isConnected || loader.classList.contains("pixel-loader--leaving")) return;

        loader.classList.add("pixel-loader--leaving");
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            loader.remove();
            return;
        }

        const removeLoader = () => {
            loader.removeEventListener("transitionend", onTransitionEnd);
            loader.remove();
        };
        const onTransitionEnd = event => {
            if (event.target === loader && event.propertyName === "opacity") removeLoader();
        };

        loader.addEventListener("transitionend", onTransitionEnd);
        window.setTimeout(removeLoader, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", dismissLoader, { once: true });
    } else {
        dismissLoader();
    }
})();
