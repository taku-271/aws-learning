// Renders every topic's README.md (and the repo's top-level README.md) into a
// static HTML site under dist/. This is a straight markdown -> HTML
// conversion, not a curated summary — the goal is a browsable copy of the
// same notes, viewable anytime (while studying, not just once a topic is
// "done").
import { readFile, writeFile, mkdir, rm, readdir, stat, copyFile } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(__dirname, 'dist');

const SITE_TITLE = 'AWS Learning Notes';

async function findTopics() {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const topics = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+-/.test(entry.name)) continue;
    const readmePath = join(repoRoot, entry.name, 'README.md');
    try {
      await stat(readmePath);
    } catch {
      continue;
    }
    topics.push({ dir: entry.name, readmePath });
  }
  topics.sort((a, b) => a.dir.localeCompare(b.dir, 'en', { numeric: true }));
  return topics;
}

function topicLabel(dir) {
  const match = dir.match(/^(\d+)-(.+)$/);
  if (!match) return dir;
  const [, number, name] = match;
  return { number, name: name.replace(/-/g, ' ') };
}

function layout({ title, bodyHtml, backLink }) {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="${backLink ? '../../style.css' : 'style.css'}">
</head>
<body>
<div class="page">
${backLink ? `<a class="back" href="${backLink}">&larr; 一覧に戻る</a>` : ''}
<article class="markdown-body">
${bodyHtml}
</article>
</div>
</body>
</html>
`;
}

async function renderTopicPage(topic) {
  const markdown = await readFile(topic.readmePath, 'utf8');
  const html = marked.parse(markdown);
  const { number, name } = topicLabel(topic.dir);
  const page = layout({
    title: `${number}. ${name} | ${SITE_TITLE}`,
    bodyHtml: html,
    backLink: '../../index.html',
  });
  const outDir = join(distDir, 'topics', topic.dir);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), page, 'utf8');
}

async function renderIndexPage(topics) {
  const intro = await readFile(join(repoRoot, 'README.md'), 'utf8').catch(() => '');

  const list =
    topics.length === 0
      ? '<p>まだ学習トピックがありません。</p>'
      : `<ul class="topic-list">${topics
          .map((t) => {
            const { number, name } = topicLabel(t.dir);
            return `<li><a href="topics/${t.dir}/index.html"><span class="topic-number">${number}</span> ${name}</a></li>`;
          })
          .join('\n')}</ul>`;

  const bodyHtml = `${marked.parse(intro)}\n<h2>学習トピック</h2>\n${list}`;
  const page = layout({ title: SITE_TITLE, bodyHtml, backLink: null });
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'index.html'), page, 'utf8');
}

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await copyFile(join(__dirname, 'style.css'), join(distDir, 'style.css'));

  const topics = await findTopics();
  await renderIndexPage(topics);
  for (const topic of topics) {
    await renderTopicPage(topic);
  }

  console.log(`Built ${topics.length} topic page(s) into ${distDir}`);
}

function serve(port = 4173) {
  const mimeTypes = { '.html': 'text/html', '.css': 'text/css' };
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const filePath = join(distDir, path);
    try {
      const data = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });
  server.listen(port, () => {
    console.log(`Preview server running at http://localhost:${port}/`);
  });
}

const watchMode = process.argv.includes('--watch');

await build();

if (watchMode) {
  serve();
  let pending = false;
  watch(repoRoot, { recursive: true }, (_event, filename) => {
    if (!filename || !filename.endsWith('README.md') || filename.startsWith('site/')) return;
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      pending = false;
      await build();
    }, 200);
  });
}
