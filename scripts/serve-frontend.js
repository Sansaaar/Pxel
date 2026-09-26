const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const frontendRoot = path.resolve(__dirname, "..", "frontend");
const port = Number(process.env.FRONTEND_PORT) || 5173;
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2"
};

function sendFile(response, filePath, method) {
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": mimeTypes[extension] || "application/octet-stream"
    });
    if (method === "HEAD") return response.end();
    fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
        return;
    }

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    } catch {
        response.writeHead(400).end("Bad request");
        return;
    }

    let filePath = path.resolve(frontendRoot, `.${pathname}`);
    if (filePath !== frontendRoot && !filePath.startsWith(`${frontendRoot}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
    }
    if (pathname === "/") filePath = path.join(frontendRoot, "index.html");

    fs.stat(filePath, (error, stats) => {
        if (!error && stats.isDirectory()) filePath = path.join(filePath, "index.html");
        fs.stat(filePath, (resolvedError, resolvedStats) => {
            if (!resolvedError && resolvedStats.isFile()) {
                sendFile(response, filePath, request.method);
                return;
            }

            if (/^\/workspace(?:\/.*)?\/?$/.test(pathname)) {
                sendFile(response, path.join(frontendRoot, "index.html"), request.method);
                return;
            }

            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
        });
    });
});

server.listen(port, "0.0.0.0", () => {
    console.log(`Pixel frontend: http://localhost:${port}`);
});
