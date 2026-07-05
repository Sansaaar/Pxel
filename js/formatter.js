// ==========================================
// Markdown Renderer
// ==========================================

const md = window.markdownit({

    html: false,

    linkify: true,

    typographer: true,

    breaks: true,

    highlight(str, lang) {

        if (lang && hljs.getLanguage(lang)) {

            return `
<pre><code class="hljs language-${lang}">
${hljs.highlight(str, { language: lang }).value}
</code></pre>
`;

        }

        return `
<pre><code class="hljs">
${hljs.highlightAuto(str).value}
</code></pre>
`;

    }

});

function formatMessage(text) {

    return md.render(text);

}