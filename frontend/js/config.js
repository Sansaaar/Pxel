// ==========================================
// Pixel AI: API Configuration
// ==========================================

(function() {
    const isLocal =
        location.hostname === "localhost" ||
        location.hostname === "127.0.0.1";

const usesLocalBackendOrigin = location.port === "3000" || location.port === "3001";
const API_BASE = isLocal
    ? (usesLocalBackendOrigin ? "" : "http://localhost:3000")
    : "https://pxel-production.up.railway.app";

    window.API_BASE = API_BASE;

    console.log("[Pixel Config] API_BASE =", window.API_BASE);
})();
