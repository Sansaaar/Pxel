// ==========================================
// Pixel AI: API Configuration
// ==========================================

(function() {
    const isLocal =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";

const API_BASE = isLocal
    ? (location.port === "3000" ? "" : "http://localhost:3000")
    : "https://pxel-production.up.railway.app";

    window.API_BASE = API_BASE;

    console.log("[Pixel Config] API_BASE =", window.API_BASE);
})();

