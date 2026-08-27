// Collects each topic's hand-authored public page (<topic>/site/index.html,
// plus any assets alongside it such as its own CSS) into a single static
// site under dist/. Each topic's page is custom-designed by whoever writes
// it — this script does not template or convert anything, it only copies
// files and builds the homepage list linking to them.
import { writeFile, mkdir, rm, readdir, stat, cp } from 'node:fs/promises';
import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const distDir = join(__dirname, 'dist');

const SITE_TITLE = 'AWS Learning Notes';

async function findTopics() {
  const entries = await readdir(repoRoot, { withFileTypes: true });
  const topics = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+-/.test(entry.name)) continue;
    const sitePagePath = join(repoRoot, entry.name, 'site', 'index.html');
    try {
      await stat(sitePagePath);
    } catch {
      continue; // topic has no published page yet
    }
    topics.push({ dir: entry.name, sourceDir: join(repoRoot, entry.name, 'site') });
  }
  topics.sort((a, b) => a.dir.localeCompare(b.dir, 'en', { numeric: true }));
  return topics;
}

function topicLabel(dir) {
  const match = dir.match(/^(\d+)-(.+)$/);
  if (!match) return { number: dir, name: dir };
  const [, number, name] = match;
  return { number, name: name.replace(/-/g, ' ') };
}

async function copyTopicPage(topic) {
  const outDir = join(distDir, 'topics', topic.dir);
  await cp(topic.sourceDir, outDir, { recursive: true });
}

async function renderIndexPage(topics) {
  const search =
    topics.length === 0
      ? ''
      : `<div class="search-box">
<input type="search" id="topic-search" placeholder="トピック名で検索" aria-label="トピック名で検索" autocomplete="off">
</div>`;

  const list =
    topics.length === 0
      ? '<p>まだ公開されているトピックがありません。</p>'
      : `<ul class="topic-list" id="topic-list">${topics
          .map((t) => {
            const { number, name } = topicLabel(t.dir);
            return `<li data-name="${name.toLowerCase()}"><a href="topics/${t.dir}/index.html"><span class="topic-number">${number}</span> ${name}</a></li>`;
          })
          .join('\n')}</ul>
<p id="topic-empty" class="topic-empty" hidden>該当するトピックがありません。</p>`;

  const script =
    topics.length === 0
      ? ''
      : `<script>
(() => {
  const input = document.getElementById('topic-search');
  const items = Array.from(document.querySelectorAll('#topic-list > li'));
  const empty = document.getElementById('topic-empty');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    let visibleCount = 0;
    for (const item of items) {
      const matches = item.dataset.name.includes(query);
      item.hidden = !matches;
      if (matches) visibleCount++;
    }
    empty.hidden = visibleCount !== 0;
  });
})();
</script>`;

  const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_TITLE}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div class="page">
<h1>${SITE_TITLE}</h1>
<p>AWSの学習トピックごとのまとめページです。</p>
<h2>学習トピック</h2>
${search}
${list}
</div>
${script}
</body>
</html>
`;
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'index.html'), page, 'utf8');
}

async function build() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(join(__dirname, 'homepage.css'), join(distDir, 'style.css'));

  const topics = await findTopics();
  await renderIndexPage(topics);
  for (const topic of topics) {
    await copyTopicPage(topic);
  }

  console.log(`Built ${topics.length} topic page(s) into ${distDir}`);
}

function serve(port = 4173) {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
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
    if (!filename || filename.startsWith('site/') || filename.includes('node_modules')) return;
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      pending = false;
      await build();
    }, 200);
  });
}
