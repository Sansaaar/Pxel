const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const artworkDirectory = path.join(projectRoot, "frontend", "artworks");
const metadataPath = path.join(artworkDirectory, "metadata.json");
const manifestPath = path.join(projectRoot, "frontend", "artworks.json");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function compareNames(a, b) {
    const left = a.toLowerCase();
    const right = b.toLowerCase();
    return left < right ? -1 : left > right ? 1 : a < b ? -1 : a > b ? 1 : 0;
}

function readMetadata() {
    if (!fs.existsSync(metadataPath)) return {};
    return JSON.parse(fs.readFileSync(metadataPath, "utf8"));
}

const metadata = readMetadata();
const files = fs.readdirSync(artworkDirectory, { withFileTypes: true })
    .filter(entry => entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase()))
    .map(entry => ({
        filename: entry.name,
        modifiedAt: fs.statSync(path.join(artworkDirectory, entry.name)).mtimeMs
    }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt || compareNames(a.filename, b.filename));

const artworks = files.map(({ filename }) => {
    const item = metadata[filename] || {};
    return {
        filename,
        title: item.title || filename,
        description: item.description || "",
        category: item.category || "",
        software: item.software || "",
        date: item.date || ""
    };
});

fs.writeFileSync(manifestPath, `${JSON.stringify({ artworks }, null, 2)}\n`, "utf8");
console.log(`Wrote ${artworks.length} artwork entries to ${path.relative(projectRoot, manifestPath)}`);
