const API_BASE =
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
        ? "http://localhost:3000"
        : "https://pxel-production.up.railway.app";
