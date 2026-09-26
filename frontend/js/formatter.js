// ==========================================
// Pixel AI 2.0: Rich Message Formatter
// Markdown, Code Highlighting, LaTeX, Tables, Task lists
// ==========================================

(function () {
    // Initialize markdown-it with all formatting features
    const md = window.markdownit({
        html: false,
        linkify: true,
        typographer: true,
        breaks: true,
        highlight: function (str, lang) {
            if (lang && window.hljs?.getLanguage(lang)) {
                try {
                    return window.hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
                } catch (_) { }
            }
            try {
                return window.hljs?.highlightAuto(str).value || md.utils.escapeHtml(str);
            } catch (_) {
                return md.utils.escapeHtml(str);
            }
        }
    });

    // --- Plugin: Task Lists (- [ ] and - [x]) ---
    const defaultListItem = md.renderer.rules.list_item_open || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.list_item_open = function (tokens, idx, options, env, self) {
        const nextToken = tokens[idx + 2];
        if (nextToken && nextToken.content) {
            const checked = nextToken.content.startsWith('[x] ') || nextToken.content.startsWith('[X] ');
            const unchecked = nextToken.content.startsWith('[ ] ');
            if (checked || unchecked) {
                nextToken.content = nextToken.content.slice(4);
                if (nextToken.children) {
                    nextToken.children.forEach(child => {
                        if (child.type === 'text' && (child.content.startsWith('[x] ') || child.content.startsWith('[X] ') || child.content.startsWith('[ ] '))) {
                            child.content = child.content.slice(4);
                        }
                    });
                }
                const checkbox = checked
                    ? '<span class="task-check checked"><i class="fa-solid fa-square-check"></i></span>'
                    : '<span class="task-check"><i class="fa-regular fa-square"></i></span>';
                return '<li class="task-item">' + checkbox;
            }
        }
        return defaultListItem(tokens, idx, options, env, self);
    };

    // --- External links open in new tab ---
    const defaultLinkOpen = md.renderer.rules.link_open || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        tokens[idx].attrSet('target', '_blank');
        tokens[idx].attrSet('rel', 'noopener noreferrer');
        return defaultLinkOpen(tokens, idx, options, env, self);
    };

    // --- Code block with header, language tag, copy button, and line numbers ---
    md.renderer.rules.fence = function (tokens, idx) {
        const token = tokens[idx];
        const langRaw = (token.info || '').trim().split(/\s+/)[0];
        const lang = langRaw.toLowerCase();
        const label = lang || 'code';
        const escapedLabel = md.utils.escapeHtml(label);

        let highlighted;
        if (lang && window.hljs?.getLanguage(lang)) {
            highlighted = window.hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value;
        } else if (!lang && token.content.trim()) {
            try {
                highlighted = window.hljs?.highlightAuto(token.content).value || md.utils.escapeHtml(token.content);
            } catch (_) {
                highlighted = md.utils.escapeHtml(token.content);
            }
        } else {
            highlighted = md.utils.escapeHtml(token.content);
        }

        // Generate line numbers
        const lines = token.content.split('\n');
        const lineCount = lines.length - (token.content.endsWith('\n') ? 1 : 0);
        let lineNums = '';
        for (let i = 1; i <= Math.max(1, lineCount); i++) {
            lineNums += `<span>${i}</span>`;
        }

        return `<div class="code-block">
            <div class="code-header">
                <span class="code-language">${escapedLabel}</span>
                <button class="copy-code" type="button" aria-label="Copy code">
                    <i class="fa-regular fa-copy"></i>
                    <span>Copy</span>
                </button>
            </div>
            <div class="code-body">
                <div class="code-lines" aria-hidden="true">${lineNums}</div>
                <pre><code class="hljs${lang ? ` language-${escapedLabel}` : ''}">${highlighted}</code></pre>
            </div>
        </div>`;
    };

    // --- Inline code styling ---
    const defaultCodeInline = md.renderer.rules.code_inline || function (tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };
    md.renderer.rules.code_inline = function (tokens, idx) {
        const content = md.utils.escapeHtml(tokens[idx].content);
        return `<code class="inline-code">${content}</code>`;
    };

    // --- Simple LaTeX / math support ($...$ and $$...$$) ---
    function renderMath(text) {
        // Block math: $$...$$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math) {
            return `<div class="math-block">${md.utils.escapeHtml(math.trim())}</div>`;
        });
        // Inline math: $...$
        text = text.replace(/\$([^\$\n]+?)\$/g, function (_, math) {
            return `<span class="math-inline">${md.utils.escapeHtml(math.trim())}</span>`;
        });
        return text;
    }

    // --- Main format function ---
    function formatMessage(text) {
        if (!text) return '';
        let html = md.render(text);
        html = renderMath(html);
        return html;
    }

    // Expose globally
    window.formatMessage = formatMessage;
})();
