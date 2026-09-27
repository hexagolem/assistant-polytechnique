import test from 'node:test';
import assert from 'node:assert/strict';
import {renderMarkdown} from '../public/markdown.js';

test('answers render emphasis, headings, nested lists, quotes and literal code', () => {
  const result = renderMarkdown('# Des pistes\n\n**Finance** et *conseil*.\n\n1. Un premier profil\n   - Une précision\n2. Un second profil\n\n> Une citation\n\n`**texte littéral**`\n\n```html\n<script>alert(1)</script>\n```');
  for (const pattern of [/<h2>Des pistes<\/h2>/, /<strong>Finance<\/strong>/, /<em>conseil<\/em>/, /<ol>[\s\S]*<ul>/, /<blockquote>/, /<code>\*\*texte littéral\*\*<\/code>/, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/]) assert.match(result, pattern);
  assert.doesNotMatch(result, /<script|<h1>/);
});

test('tables have a keyboard-accessible scroll region and CSP-compatible alignment', () => {
  const result = renderMarkdown('| Métier | Promotion |\n| :--- | ---: |\n| **Finance** | 2011 |');
  assert.match(result, /class="answer-table" role="region" aria-label="Tableau de la réponse" tabindex="0"/);
  assert.match(result, /<th class="align-right">Promotion<\/th>/);
  assert.match(result, /<strong>Finance<\/strong>/);
  assert.doesNotMatch(result, /style=/);
});

test('source links open safely and plain URLs remain usable', () => {
  const result = renderMarkdown('[Source](https://www.polytechnique.edu/)\n\nhttps://dust.tt\n\n[Contact](mailto:demo@example.test)');
  assert.equal((result.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 3);
  assert.match(result, /href="https:\/\/www.polytechnique.edu\/"/);
});

test('raw HTML, images and event handlers are never executable', () => {
  const result = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<svg onload=alert(1)>\n\n![portrait](https://example.test/tracker.png)\n\n![<img src=x onerror=alert(1)>](https://example.test/p.png)');
  assert.doesNotMatch(result, /<(script|img|svg|iframe|object|style|form)\b/i);
  assert.match(result, /&lt;script&gt;/);
  assert.doesNotMatch(result, /<[^>]+\sonerror=/i);
});

test('unsafe, obfuscated, local and protocol-relative links stay inert', () => {
  for (const url of ['javascript:alert%281%29', 'JaVaScRiPt:alert%281%29', 'javascript&#58;alert%281%29', 'java&#x09;script:alert%281%29', 'data:text/html;base64,PHNjcmlwdD4=', 'vbscript:msgbox%281%29', 'file:///etc/passwd', '//example.test', '/api/logout']) {
    assert.doesNotMatch(renderMarkdown(`[clique](${url})`), /<a\b/i, url);
  }
});

test('quotes in link titles cannot inject HTML attributes', () => {
  const result = renderMarkdown('[Source](https://example.test "&quot; onmouseover=&quot;alert(1)")');
  assert.match(result, /title="&quot; onmouseover=&quot;alert\(1\)"/);
  assert.doesNotMatch(result, /" onmouseover="/);
});

test('plain text and incomplete Markdown remain readable', () => {
  for (const source of ['Du texte simple & utile.', '**gras non terminé', '[lien non terminé', '```\nconst x = 1;', '', 'a'.repeat(20000)]) {
    const result = renderMarkdown(source);
    assert.equal(typeof result, 'string');
    assert.doesNotMatch(result, /undefined|\[object Object\]/);
  }
});
