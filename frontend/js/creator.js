document.addEventListener("DOMContentLoaded", async () => {
    const backBtn = document.getElementById("backBtn");
    backBtn?.addEventListener("click", () => { window.location.href = "index.html"; });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
            window.location.href = "index.html";
        }
    });

    try {
        const response = await fetch("data/creatorData.json", { headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error("Creator profile unavailable");
        const data = await response.json();

        setText("creatorSummary", data.summary);
        setText("aboutText", data.about);
        setText("creatorPhilosophy", data.philosophy, true);
        renderTags("roleList", data.roles, "role-tag");
        renderTags("creativeList", data.creativeInterests, "creative-tag");
        renderProjects(data.projects);
        renderSocials(data.socials);
    } catch (error) {
        console.error("[Creator Page] Profile load failed:", error);
        const projects = document.getElementById("projectsGrid");
        if (projects) projects.textContent = "Creator details could not be loaded.";
    }
});

function setText(id, value, isQuote = false) {
    const element = document.getElementById(id);
    if (!element || typeof value !== "string") return;
    element.textContent = value;
    if (isQuote) element.hidden = !value.trim();
}

function renderTags(containerId, values, className) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(values)) return;
    const fragment = document.createDocumentFragment();
    values.forEach(value => {
        if (typeof value !== "string" || !value.trim()) return;
        const tag = document.createElement("li");
        tag.className = className;
        tag.textContent = value;
        fragment.appendChild(tag);
    });
    container.replaceChildren(fragment);
}

function safePublicUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;
    try {
        const url = new URL(value, window.location.href);
        if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
        return url.href;
    } catch {
        return null;
    }
}

function renderProjects(projects) {
    const container = document.getElementById("projectsGrid");
    if (!container) return;
    if (!Array.isArray(projects) || !projects.length) {
        container.textContent = "No public projects are listed yet.";
        return;
    }

    const icons = {
        "Pixel AI": "fa-solid fa-sparkles",
        "Mada": "fa-solid fa-film",
        "GroupSphere": "fa-solid fa-people-group"
    };
    const fragment = document.createDocumentFragment();
    projects.forEach(project => {
        if (!project || typeof project.title !== "string") return;
        const article = document.createElement("article");
        article.className = "project-item";

        const icon = document.createElement("span");
        icon.className = "project-icon";
        const iconElement = document.createElement("i");
        iconElement.className = icons[project.title] || "fa-solid fa-diagram-project";
        iconElement.setAttribute("aria-hidden", "true");
        icon.appendChild(iconElement);

        const category = document.createElement("span");
        category.className = "project-category";
        category.textContent = typeof project.category === "string" ? project.category : "Project";

        const title = document.createElement("h3");
        title.textContent = project.title;
        const description = document.createElement("p");
        description.textContent = typeof project.description === "string" ? project.description : "";

        article.append(icon, category, title, description);
        const href = safePublicUrl(project.url);
        if (href) {
            const link = document.createElement("a");
            link.className = "project-link";
            link.href = href;
            link.textContent = typeof project.action === "string" ? project.action : "Open project";
            if (new URL(href).origin !== window.location.origin) {
                link.target = "_blank";
                link.rel = "noopener noreferrer";
            }
            const arrow = document.createElement("i");
            arrow.className = "fa-solid fa-arrow-up-right-from-square";
            arrow.setAttribute("aria-hidden", "true");
            link.appendChild(arrow);
            article.appendChild(link);
        }
        fragment.appendChild(article);
    });
    container.replaceChildren(fragment);
}

function renderSocials(socials) {
    const container = document.getElementById("socialsGrid");
    if (!container) return;
    if (!Array.isArray(socials) || !socials.length) {
        container.textContent = "No public social profiles are listed.";
        return;
    }

    const fragment = document.createDocumentFragment();
    socials.forEach(profile => {
        if (!profile || typeof profile.platform !== "string") return;
        const href = safePublicUrl(profile.url);
        const card = document.createElement(href ? "a" : "div");
        card.className = "social-profile";
        if (href) {
            card.href = href;
            card.target = "_blank";
            card.rel = "noopener noreferrer";
        }
        const icon = document.createElement("i");
        icon.className = "fa-brands fa-instagram";
        icon.setAttribute("aria-hidden", "true");
        const text = document.createElement("span");
        const name = document.createElement("strong");
        name.textContent = profile.platform;
        const handle = document.createElement("small");
        handle.textContent = typeof profile.handle === "string" && profile.handle
            ? profile.handle
            : "Public handle not listed";
        text.append(name, handle);
        card.append(icon, text);
        if (!href) {
            const note = document.createElement("small");
            note.className = "social-link-note";
            note.textContent = "Profile link not listed";
            card.appendChild(note);
        }
        fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
}
