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

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Request logging
app.use((req, res, next) => {
    if (req.url.startsWith("/api")) {
        console.log(`[Pixel] ${req.method} ${req.url}`);
    }
    next();
});

// API Routes
app.use("/api/chat", chatRoute);
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

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`==========================================`);
    console.log(`  Pixel AI 2.0 Backend Running on ${PORT}  `);
    console.log(`  Frontend: http://localhost:${PORT}        `);
    console.log(`==========================================`);
});