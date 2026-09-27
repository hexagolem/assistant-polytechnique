import MarkdownIt from './vendor/markdown-it-15.0.2.mjs';

// Only this configured parser may turn an agent's answer into HTML.
// Raw HTML and automatic image loading are deliberately not supported.
const markdown = new MarkdownIt({html: false, linkify: true, typographer: false, breaks: false});
markdown.validateLink = url => /^(https?:\/\/|mailto:)/i.test(url) && !/[\u0000-\u0020\u007f]/.test(url);
markdown.linkify.set({fuzzyEmail: false});
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
// Answer headings remain below the page title in the document hierarchy.
for (const rule of ['heading_open', 'heading_close']) {
  markdown.renderer.rules[rule] = (tokens, index, options, env, renderer) => {
    const level = Math.min(4, Number(tokens[index].tag.slice(1)) + 1);
    tokens[index].tag = `h${level}`;
    return renderer.renderToken(tokens, index, options);
  };
}
markdown.renderer.rules.table_open = () => '<div class="answer-table" role="region" aria-label="Tableau de la réponse" tabindex="0"><table>\n';
markdown.renderer.rules.table_close = () => '</table></div>\n';
// Use CSS classes instead of inline styles, which the site's CSP forbids.
for (const rule of ['th_open', 'td_open']) {
  markdown.renderer.rules[rule] = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const alignment = /^text-align:(left|center|right)$/.exec(token.attrGet('style') || '');
    const styleIndex = token.attrIndex('style');
    if (styleIndex >= 0) token.attrs.splice(styleIndex, 1);
    if (alignment) token.attrSet('class', `align-${alignment[1]}`);
    return renderer.renderToken(tokens, index, options);
  };
}

export function renderMarkdown(text) {
  const source = typeof text === 'string' ? text : '';
  try {
    return markdown.render(source);
  } catch {
    // A rendering failure must never hide the answer or break the chat.
    return `<p class="answer-plain">${markdown.utils.escapeHtml(source)}</p>`;
  }
}

export function renderAnswer(element, text) {
  element.classList.add('formatted-answer');
  element.innerHTML = renderMarkdown(text);
}
