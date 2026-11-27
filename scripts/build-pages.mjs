// Builds the deployed site: the static files as they are, plus one real page per lesson (/tools/, ...) with its own
// title and description and the lesson text already in the HTML, so search engines can index every lesson.
// The app itself still runs on #/ routes; a lesson page just tells it which page to start on.
// Usage: node scripts/build-pages.mjs [out-dir]   (default: _site)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || path.join(root, '_site'));
const SITE = 'https://romanzdk.github.io/langgraph-and-pydantic-ai/';
const NAME = 'LangGraph & Pydantic AI';
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const ctx = vm.createContext({});
vm.runInContext('globalThis.window = globalThis;', ctx);
for (const [, src] of html.matchAll(/<script src="((?:lib|traces|lessons\/)[^"]*\.js)"/g)) vm.runInContext(fs.readFileSync(path.join(root, src), 'utf8'), ctx);
const { LESSONS } = ctx;

fs.rmSync(out, { recursive: true, force: true });
for (const f of ['index.html', 'style.css', 'app.js', 'lib.js', 'traces.js', 'lessons', 'docs/images', 'google63d07f5be656bfba.html']) {
  fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const strip = (s) => String(s).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const pre = (label, src) => `<figure><figcaption>${esc(label)}</figcaption><pre><code>${esc(src)}</code></pre></figure>`;
const PANES = { lg: 'LangGraph', pa: 'Pydantic AI', cb: 'LangGraph + Pydantic AI', py: 'Python', sh: 'Shell', out: 'Output' };
const cheatTable = (rows) => `<table><tr><th>LangGraph</th><th>Pydantic AI</th></tr>${rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
// JSON for a <script> tag: "<" escaped so text in it can never close the tag.
const ldJson = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

function page({ slug, title, description, body, head = '' }) {
  const url = slug ? `${SITE}${slug}/` : SITE;
  const set = (s, re, value) => {
    if (!re.test(s)) throw new Error(`index.html: ${re} not found`);
    return s.replace(re, value);
  };
  let s = html;
  if (slug) s = set(s, /<meta charset="utf-8">/, '<meta charset="utf-8">\n  <base href="../">');
  s = set(s, /<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  s = set(s, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(description)}">`);
  s = set(s, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`);
  s = set(s, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  s = set(s, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(description)}">`);
  s = set(s, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  if (head) s = set(s, /<\/head>/, `${head}\n</head>`);
  if (slug) s = set(s, /<body>/, `<body data-page="${slug}">`);
  s = set(s, /<main id="main"><\/main>/, `<main id="main">${body}</main>`);
  const file = path.join(out, slug, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  return url;
}

const urls = [];
const lessonLinks = LESSONS.map((l, i) => `<li><a href="${l.id}/">${i + 1}. ${l.title}</a>: ${l.summary}</li>`).join('');
urls.push(
  page({
    slug: '',
    title: 'LangGraph & Pydantic AI, side by side',
    description: html.match(/<meta name="description" content="([^"]*)">/)[1],
    body: `<h1>LangGraph and Pydantic AI, side by side</h1><ol>${lessonLinks}</ol><p><a href="cheatsheet/">Cheat sheet</a></p>`,
    head: ldJson({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: 'LangGraph & Pydantic AI, side by side',
      description: 'Learn LangGraph and Pydantic AI by building the same small LLM pipeline in both, side by side.',
      url: SITE,
      inLanguage: 'en',
      isAccessibleForFree: true,
      teaches: 'Building LLM pipelines with LangGraph and Pydantic AI',
      provider: { '@type': 'Person', name: 'Roman Žydyk', url: 'https://romanzdk.com' },
      hasPart: LESSONS.map((l) => ({ '@type': 'LearningResource', name: strip(l.title), url: `${SITE}${l.id}/` })),
    }),
  }),
);

LESSONS.forEach((l, i) => {
  const body = [
    `<article class="lesson"><p class="kicker">Lesson ${i + 1} of ${LESSONS.length}</p><h1>${l.title}</h1>`,
    `<div class="intro">${l.intro}</div>`,
    ...(l.examples || []).map(
      (ex) => `<section class="example"><h2>${ex.title}</h2>${ex.text || ''}
        ${Object.keys(PANES).filter((k) => ex[k]).map((k) => pre(PANES[k], ex[k])).join('')}</section>`,
    ),
    l.differ ? `<aside class="differ"><h2>${l.differTitle || 'Where they differ'}</h2>${l.differ}</aside>` : '',
    l.cheat ? `<section><h2>Cheat card</h2>${cheatTable(l.cheat)}</section>` : '',
    `<p>${LESSONS[i - 1] ? `<a href="${LESSONS[i - 1].id}/">← ${LESSONS[i - 1].title}</a>` : ''} ${LESSONS[i + 1] ? `<a href="${LESSONS[i + 1].id}/">${LESSONS[i + 1].title} →</a>` : ''}</p></article>`,
  ].join('\n');
  urls.push(page({ slug: l.id, title: `${strip(l.title)} · ${NAME}`, description: `${strip(l.summary)} A LangGraph and Pydantic AI lesson.`, body }));
});

urls.push(
  page({
    slug: 'cheatsheet',
    title: `Cheat sheet · ${NAME}`,
    description: 'Every LangGraph construct next to its Pydantic AI equivalent, in one table.',
    body: `<h1>Cheat sheet</h1>${LESSONS.filter((l) => l.cheat).map((l) => `<section><h2><a href="${l.id}/">${l.title}</a></h2>${cheatTable(l.cheat)}</section>`).join('')}`,
  }),
);

// GitHub Pages serves this for any missing URL, at any depth: absolute base, not indexed, the app shows the start page.
fs.writeFileSync(
  path.join(out, '404.html'),
  html
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <base href="/langgraph-and-pydantic-ai/">\n  <meta name="robots" content="noindex">')
    .replace(/<title>[^<]*<\/title>/, `<title>Page not found · ${esc(NAME)}</title>`)
    .replace(/\s*<link rel="canonical" href="[^"]*">/, ''),
);

fs.writeFileSync(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`);
console.log(`Built ${urls.length} pages into ${path.relative(root, out) || out}`);
