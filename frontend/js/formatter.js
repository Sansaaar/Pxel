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
    function isMathSource(source) {
        return /\\(?:frac|dfrac|tfrac|sqrt|sum|int|lim|to|left|right|text|mathrm|mathbf|operatorname|begin|end|times|cdot|div|pm|ne|neq|lt|gt|le|leq|ge|geq|approx|equiv|pi|infty|alpha|beta|Delta|theta|lambda|mu|sigma|omega|rightarrow)|(?:\^|_)\{[^}]+\}|\^[0-9]/.test(source);
    }

    function isDisplayMathSource(source) {
        return /\n|\\begin\s*\{(?:cases|aligned|gathered|matrix|pmatrix|bmatrix|array)\}/.test(source);
    }

    function escapeMath(source) {
        return md.utils.escapeHtml(String(source)
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/\\lt\b/g, "<")
            .replace(/\\gt\b/g, ">"));
    }

    md.renderer.rules.fence = function (tokens, idx) {
        const token = tokens[idx];
        const langRaw = (token.info || '').trim().split(/\s+/)[0];
        const lang = langRaw.toLowerCase();
        const isMathFence = ["math", "latex", "tex"].includes(lang) || (!lang && isMathSource(token.content));
        if (isMathFence) {
            return `<div class="math-block">\\[${escapeMath(token.content.trim())}\\]</div>`;
        }
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

    const pendingMathTypesets = new Set();
    function typesetMath(element) {
        if (!element) return;
        if (window.MathJax?.typesetPromise) {
            pendingMathTypesets.delete(element);
            window.MathJax.typesetPromise([element]).catch(err => {
                console.warn("[Pixel Math] Typesetting failed:", err);
            });
        } else {
            pendingMathTypesets.add(element);
        }
    }

    function clearMathTypesetting(element) {
        if (!element) return;
        pendingMathTypesets.delete(element);
        window.MathJax?.typesetClear?.([element]);
    }

    window.addEventListener("pixel-mathjax-ready", () => {
        pendingMathTypesets.forEach(element => {
            if (element.isConnected) typesetMath(element);
            else pendingMathTypesets.delete(element);
        });
    }, { once: true });

    window.typesetMath = typesetMath;
    window.clearMathTypesetting = clearMathTypesetting;

    // --- Main format function ---
    function protectMath(source) {
        const expressions = [];
        const pattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]*`+)|(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g;
        const protectedText = source.replace(pattern, (match, code, expression) => {
            if (code) return code;
            const display = expression.startsWith("$$") || expression.startsWith("\\[");
            const body = display
                ? expression.slice(2, -2)
                : expression.startsWith("\\(")
                    ? expression.slice(2, -2)
                    : expression.slice(1, -1);
            const marker = `PIXELMATHPLACEHOLDER${expressions.length}END`;
            expressions.push({ marker, body, display });
            return marker;
        });
        return { protectedText, expressions };
    }

    function restoreMath(html, expressions) {
        expressions.forEach(({ marker, body, display }) => {
            const delimiters = display ? ["\\[", "\\]"] : ["\\(", "\\)"];
            const wrapper = display ? "div" : "span";
            const className = display ? "math-block" : "math-inline";
            html = html.replaceAll(marker,
                `<${wrapper} class="${className}">${delimiters[0]}${escapeMath(body.trim())}${delimiters[1]}</${wrapper}>`
            );
        });
        return html;
    }

    function isMathCode(source) {
        return /^\s*(?:\$[\s\S]+\$|\\\([\s\S]+\\\)|\\\[[\s\S]+\\\])\s*$/.test(source) ||
            isMathSource(source);
    }

    // Math-like inline code is common in model output; render it as TeX, not code.
    const previousCodeInline = md.renderer.rules.code_inline;
    md.renderer.rules.code_inline = function (tokens, idx) {
        const source = tokens[idx].content;
        if (isMathCode(source)) {
            let math = source.trim();
            if (math.startsWith("$$") && math.endsWith("$$")) math = math.slice(2, -2);
            else if (math.startsWith("$") && math.endsWith("$")) math = math.slice(1, -1);
            else if (math.startsWith("\\(") && math.endsWith("\\)")) math = math.slice(2, -2);
            else if (math.startsWith("\\[") && math.endsWith("\\]")) math = math.slice(2, -2);
            const display = isDisplayMathSource(math);
            const tag = "span";
            const className = display ? "math-block" : "math-inline";
            const delimiters = display ? ["\\[", "\\]"] : ["\\(", "\\)"];
            return `<${tag} class="${className}">${delimiters[0]}${escapeMath(math.trim())}${delimiters[1]}</${tag}>`;
        }
        if (previousCodeInline) return previousCodeInline(tokens, idx);
        return `<code class="inline-code">${md.utils.escapeHtml(source)}</code>`;
    };

    // --- Main format function ---
    function formatMessage(text) {
        if (!text) return '';
        const { protectedText, expressions } = protectMath(String(text));
        return restoreMath(md.render(protectedText), expressions);
    }

    // Expose globally
    window.formatMessage = formatMessage;
})();
