// ==========================================
// Pixel AI 2.0: Upload & Multimodal Attachment System
// Supports: Images (Vision AI), Documents & Code files
// ==========================================

(function () {
    const attachBtn = document.getElementById("attachBtn");
    const fileInput = document.getElementById("fileInput");
    const attachmentContainer = document.getElementById("attachmentContainer");

    // Internal list of processed attachment objects:
    // { id, file, name, type, size, data (base64 for images), content (text for docs), isImage }
    let uploadedFiles = [];

    // ------------------------------------------
    // File Processing (Base64 for images, text for docs)
    // ------------------------------------------
    async function processFile(file) {
        const isImage = file.type.startsWith("image/");

        return new Promise((resolve) => {
            const reader = new FileReader();

            if (isImage) {
                reader.onload = (e) => {
                    resolve({
                        id: `${file.name}-${file.size}-${Date.now()}`,
                        file,
                        name: file.name,
                        type: file.type || "image/png",
                        size: file.size,
                        data: e.target.result, // base64 data URL
                        isImage: true
                    });
                };
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(file);
            } else {
                // Text / Code / JSON / Markdown
                reader.onload = (e) => {
                    resolve({
                        id: `${file.name}-${file.size}-${Date.now()}`,
                        file,
                        name: file.name,
                        type: file.type || "text/plain",
                        size: file.size,
                        content: e.target.result,
                        isImage: false
                    });
                };
                reader.onerror = () => resolve(null);
                // Read up to 2MB as text
                if (file.size <= 2 * 1024 * 1024) {
                    reader.readAsText(file);
                } else {
                    resolve({
                        id: `${file.name}-${file.size}-${Date.now()}`,
                        file,
                        name: file.name,
                        type: file.type || "application/octet-stream",
                        size: file.size,
                        content: `[File ${file.name} too large to inline (>2MB)]`,
                        isImage: false
                    });
                }
            }
        });
    }

    async function addFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        for (const file of fileList) {
            const exists = uploadedFiles.some(f => f.name === file.name && f.size === file.size);
            if (!exists) {
                const item = await processFile(file);
                if (item) {
                    uploadedFiles.push(item);
                }
            }
        }

        renderAttachments();
    }

    function removeAttachment(index) {
        if (index >= 0 && index < uploadedFiles.length) {
            uploadedFiles.splice(index, 1);
            renderAttachments();
        }
    }

    function clearUploads() {
        uploadedFiles = [];
        renderAttachments();
    }

    function renderAttachments() {
        if (!attachmentContainer) return;
        attachmentContainer.innerHTML = "";

        if (uploadedFiles.length === 0) {
            attachmentContainer.style.display = "none";
            return;
        }

        attachmentContainer.style.display = "flex";

        uploadedFiles.forEach((item, index) => {
            const card = document.createElement("div");
            card.className = "attachment-card";

            const previewHtml = item.isImage && item.data
                ? `<img src="${item.data}" class="attachment-thumb" alt="${escapeHtml(item.name)}">`
                : `<i class="${getFileIcon(item.name)} attachment-icon"></i>`;

            card.innerHTML = `
                <div class="attachment-left">
                    ${previewHtml}
                    <div class="attachment-info">
                        <div class="attachment-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                        <div class="attachment-size">${formatSize(item.size)}</div>
                    </div>
                </div>
                <button class="remove-file" type="button" data-index="${index}" title="Remove attachment">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            `;

            attachmentContainer.appendChild(card);
        });
    }

    function getFileIcon(name) {
        const ext = (name || "").split(".").pop().toLowerCase();
        switch (ext) {
            case "pdf": return "fa-solid fa-file-pdf";
            case "doc":
            case "docx": return "fa-solid fa-file-word";
            case "txt":
            case "md": return "fa-solid fa-file-lines";
            case "csv": return "fa-solid fa-file-csv";
            case "json":
            case "js":
            case "ts":
            case "jsx":
            case "tsx":
            case "py":
            case "java":
            case "cpp":
            case "c":
            case "html":
            case "css": return "fa-solid fa-file-code";
            case "zip":
            case "rar":
            case "7z": return "fa-solid fa-file-zipper";
            default: return "fa-solid fa-file";
        }
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }

    function escapeHtml(str) {
        return (str || "").replace(/[&<>"']/g, c => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;"
        })[c]);
    }

    // ------------------------------------------
    // Event Listeners Setup
    // ------------------------------------------
    window.addEventListener("DOMContentLoaded", () => {
        if (attachBtn && fileInput) {
            attachBtn.addEventListener("click", () => {
                fileInput.click();
            });

            fileInput.addEventListener("change", () => {
                if (fileInput.files) {
                    addFiles(fileInput.files);
                    fileInput.value = "";
                }
            });
        }

        if (attachmentContainer) {
            attachmentContainer.addEventListener("click", (e) => {
                const removeBtn = e.target.closest(".remove-file");
                if (removeBtn) {
                    const idx = parseInt(removeBtn.dataset.index, 10);
                    removeAttachment(idx);
                }
            });
        }

        // Drag & Drop
        window.addEventListener("dragover", (e) => {
            e.preventDefault();
            document.body.classList.add("dragging");
        });

        window.addEventListener("dragleave", (e) => {
            if (e.clientX === 0 && e.clientY === 0) {
                document.body.classList.remove("dragging");
            }
        });

        window.addEventListener("drop", (e) => {
            e.preventDefault();
            document.body.classList.remove("dragging");
            if (e.dataTransfer && e.dataTransfer.files) {
                addFiles(e.dataTransfer.files);
            }
        });

        // Paste image directly into prompt textarea (e.g. screenshots!)
        const promptInput = document.getElementById("promptInput");
        if (promptInput) {
            promptInput.addEventListener("paste", (e) => {
                const items = e.clipboardData?.items;
                if (items) {
                    const filesToUpload = [];
                    for (let i = 0; i < items.length; i++) {
                        if (items[i].type.indexOf("image") !== -1) {
                            const blob = items[i].getAsFile();
                            if (blob) filesToUpload.push(blob);
                        }
                    }
                    if (filesToUpload.length > 0) {
                        addFiles(filesToUpload);
                    }
                }
            });
        }
    });

    // ------------------------------------------
    // Public API for Chat Engine
    // ------------------------------------------
    window.getUploadedAttachments = function () {
        return uploadedFiles.map(f => ({
            name: f.name,
            type: f.type,
            size: f.size,
            data: f.data || null,
            content: f.content || null,
            isImage: f.isImage
        }));
    };

    window.hasUploads = function () {
        return uploadedFiles.length > 0;
    };

    window.clearUploads = clearUploads;
    window.renderAttachments = renderAttachments;
})();