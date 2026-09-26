// ==========================================
// Pixel AI: Artworks Gallery Backend API
// GET /api/artworks
// Dynamically scans frontend/artworks folder
// ==========================================

const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

const ARTWORKS_DIR = path.resolve(__dirname, "..", "..", "frontend", "artworks");
const METADATA_PATH = path.join(ARTWORKS_DIR, "metadata.json");

const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function cleanFileNameToTitle(filename) {
    const nameWithoutExt = path.parse(filename).name;
    // Remove trailing " - Copy" or random hash IDs cleanly
    const cleaned = nameWithoutExt
        .replace(/ - Copy$/i, "")
        .replace(/^[0-9_]{15,}/, "Artwork")
        .replace(/_/g, " ")
        .replace(/\(final\)/i, " (Final)");
    
    // Capitalize words
    return cleaned
        .split(" ")
        .map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : "")
        .join(" ")
        .trim() || "Untitled Artwork";
}

router.get("/", (req, res) => {
    try {
        if (!fs.existsSync(ARTWORKS_DIR)) {
            return res.json({ success: true, artworks: [] });
        }

        let metadataMap = {};
        if (fs.existsSync(METADATA_PATH)) {
            try {
                const rawMeta = fs.readFileSync(METADATA_PATH, "utf8");
                metadataMap = JSON.parse(rawMeta);
            } catch (e) {
                console.warn("[Artworks API] Metadata read warning:", e.message);
            }
        }

        const files = fs.readdirSync(ARTWORKS_DIR);
        const artworks = [];

        files.forEach((filename, index) => {
            const ext = path.extname(filename).toLowerCase();
            if (!SUPPORTED_EXTENSIONS.has(ext)) return;

            const filePath = path.join(ARTWORKS_DIR, filename);
            const stats = fs.statSync(filePath);
            const customMeta = metadataMap[filename] || {};

            const title = customMeta.title || cleanFileNameToTitle(filename);
            const description = customMeta.description || null;
            const category = customMeta.category || null;
            const software = customMeta.software || null;
            const date = customMeta.date || stats.mtime.toISOString().split("T")[0];

            artworks.push({
                id: `art-${index + 1}-${filename}`,
                filename: filename,
                url: `artworks/${filename}`,
                title: title,
                description: description,
                category: category,
                software: software,
                date: date,
                modifiedTimestamp: stats.mtimeMs
            });
        });

        // Sort latest first
        artworks.sort((a, b) => b.modifiedTimestamp - a.modifiedTimestamp);

        return res.json({
            success: true,
            total: artworks.length,
            artworks: artworks
        });
    } catch (err) {
        console.error("[Artworks API Error]:", err);
        return res.status(500).json({
            success: false,
            error: "Failed to load artwork list."
        });
    }
});

module.exports = router;
