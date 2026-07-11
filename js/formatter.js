// Pixel markdown renderer: safe HTML, linked URLs, tables, and rich code blocks.

const md = window.markdownit({ html: false, linkify: true, typographer: true, breaks: true });
const defaultLinkOpen = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options));

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    tokens[index].attrSet("target", "_blank");
    tokens[index].attrSet("rel", "noopener noreferrer");
    return defaultLinkOpen(tokens, index, options, env, self);
};

md.renderer.rules.fence = (tokens, index) => {
    const token = tokens[index];
    const language = (token.info || "").trim().split(/\s+/)[0].toLowerCase();
    const label = language || "text";
    const escapedLabel = md.utils.escapeHtml(label);
    const highlighted = language && window.hljs?.getLanguage(language)
        ? window.hljs.highlight(token.content, { language, ignoreIllegals: true }).value
        : md.utils.escapeHtml(token.content);

    return `<div class="code-block"><div class="code-header"><span class="code-language">${escapedLabel}</span><button class="copy-code" type="button" aria-label="Copy code"><i class="fa-regular fa-copy"></i><span>Copy</span></button></div><pre><code class="hljs${language ? ` language-${escapedLabel}` : ""}">${highlighted}</code></pre></div>`;
};

function formatMessage(text) { return md.render(text); }
