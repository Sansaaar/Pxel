const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, ".env") });

const express = require("express");
const cors = require("cors");

const chatRoute = require("./routes/chat");
const modelsRoute = require("./routes/models");
const artworksRoute = require("./routes/artworks");
const userChatRoute = require("./routes/userChat");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);

const allowedOrigins = new Set([
    "https://chat.goldyn.xyz",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    ...(process.env.FRONTEND_ORIGINS || "").split(",").map(origin => origin.trim()).filter(Boolean)
]);

app.use(cors({
    origin(origin, callback) {
        callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Pixel-Session-Id"],
    exposedHeaders: ["X-Pixel-Model", "X-Pixel-Fallback", "Retry-After"]
}));
app.use((req, res, next) => {
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
});
app.use(express.json({ limit: "9mb", strict: true }));

const chatRateLimit = (() => {
    const buckets = new Map();
    const windowMs = 10 * 60 * 1000;
    const maxRequests = Math.max(1, Number.parseInt(process.env.AI_CHAT_RATE_LIMIT, 10) || 30);
    return (req, res, next) => {
        const now = Date.now();
        const key = req.ip || req.socket.remoteAddress || "unknown";
        let bucket = buckets.get(key);
        if (!bucket || now >= bucket.resetAt) {
            bucket = { count: 0, resetAt: now + windowMs };
            buckets.set(key, bucket);
        }
        bucket.count += 1;
        if (buckets.size > 10_000) {
            for (const [ip, entry] of buckets) {
                if (now >= entry.resetAt) buckets.delete(ip);
            }
        }
        if (bucket.count > maxRequests) {
            res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
            return res.status(429).json({
                success: false,
                error: { code: "RATE_LIMITED", message: "Too many requests. Please wait a little and try again." }
            });
        }
        next();
    };
})();

// Request logging
app.use((req, res, next) => {
    if (req.url.startsWith("/api")) {
        console.log(`[Pixel] ${req.method} ${req.path}`);
    }
    next();
});

// API Routes
app.use("/api/chat", chatRateLimit, chatRoute);
app.use("/api/models", modelsRoute);
app.use("/api/artworks", artworksRoute);
app.use("/api/user-chat", userChatRoute);

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        status: "healthy",
        version: "2.0.0",
        timestamp: new Date().toISOString()
    });
});

// Serve frontend static assets for unified deployment
const frontendPath = path.resolve(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Fallback to index.html for root if needed
app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    if (err?.type === "entity.too.large") {
        return res.status(413).json({ success: false, error: { code: "REQUEST_TOO_LARGE", message: "The request is too large." } });
    }
    if (err instanceof SyntaxError && "body" in err) {
        return res.status(400).json({ success: false, error: { code: "INVALID_JSON", message: "The request body must contain valid JSON." } });
    }
    console.error("[Pixel] Unhandled request error:", err);
    return res.status(500).json({ success: false, error: { code: "SERVER_ERROR", message: "Something went wrong. Please try again." } });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`  Pixel AI 2.0 Backend Running on ${PORT}  `);
    console.log(`  Frontend: http://localhost:${PORT}        `);
    console.log(`==========================================`);
});
