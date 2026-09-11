// Builds dist/nutrition-app.html: one self-contained file (app + data inlined) that runs from a file:// URL, a phone, or an artifact.
// It rewrites ES module imports into a single classic script by concatenating modules in dependency order.
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const R = p => fs.readFileSync(new URL(p, root), 'utf8');

const engineOrder = ['src/engine/dictionary.js', 'src/engine/nutrition.js', 'src/engine/plan.js', 'src/engine/checker.js', 'src/engine/planner.js', 'src/engine/grocery.js', 'src/engine/screen.js'];
// Any engine module not listed above (energy.js, group.js, pantry.js, ...) is appended after the ordered ones so the UI can import it.
const engineDir = new URL('src/engine/', root);
const engineExtra = fs.existsSync(engineDir) ? fs.readdirSync(engineDir).filter(f => f.endsWith('.js')).sort().map(f => 'src/engine/' + f).filter(f => !engineOrder.includes(f)) : [];
const order = [...engineOrder, ...engineExtra, 'src/store.js'];
const uiDir = new URL('src/ui/', root);
const uiFiles = fs.existsSync(uiDir) ? fs.readdirSync(uiDir).filter(f => f.endsWith('.js')).sort().map(f => 'src/ui/' + f) : [];
const appFile = 'src/app.js';

function stripModuleSyntax(code) {
  return code
    .replace(/^\s*import\s+[^;]*?from\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, 'const __default = ')
    .replace(/^\s*export\s+(const|let|var|function|class|async function)\s+/gm, '$1 ')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
}

// --lite builds dist/peace-meal-lite.html: one person, four tabs, and without the Wikibooks recipes (no nutrition data, 4 MB).
const LITE = process.argv.includes('--lite');
// --pages builds the hosted copy for GitHub Pages instead: dist/pages/lite/ (or dist/pages/full/) with index.html, a manifest,
// PNG icons, and a small service worker, so the page can be added to an iPhone home screen and opened offline.
const PAGES = process.argv.includes('--pages');
const data = {};
for (const f of ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'recipes-open', 'recipes-usda', 'articles', 'swaps', 'diet-lists']) {
  const p = new URL('data/' + f + '.json', root);
  data[f] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : (f === 'dictionaries' ? { tags: {}, entries: [] } : f === 'articles' ? {} : f === 'swaps' ? { families: {}, swaps: [] } : f === 'diet-lists' ? { families: {} } : []);
}
if (LITE && Array.isArray(data['recipes-open'])) data['recipes-open'] = data['recipes-open'].filter(r => r.source !== 'Wikibooks Cookbook');
if (LITE) data['recipes-usda'] = [];   // the USDA collection stays a full-app opt-in; lite ships Peace Meal's own recipes plus the NHS and Parent Club sets
const html = R('index.html');
if (fs.existsSync(new URL('breathe.html', root))) data.breatheHtml = R('breathe.html');
const iconSvg = fs.existsSync(new URL('icon.svg', root)) ? R('icon.svg') : '';
const iconData = iconSvg ? 'data:image/svg+xml;utf8,' + encodeURIComponent(iconSvg) : '';
const css = fs.existsSync(new URL('src/app.css', root)) ? R('src/app.css') : '';
let js = '';
for (const f of [...order, ...uiFiles, appFile]) {
  if (!fs.existsSync(new URL(f, root))) continue;
  js += `\n/* ---- ${f} ---- */\n` + stripModuleSyntax(R(f)) + '\n';
}
const dataScript = `<script>${LITE ? 'window.__PEACE_MEAL_LITE__ = true;' : ''}window.__APP_DATA__ = ${JSON.stringify(data).replace(/<\/script/gi, '<\\/script')};</script>`;
let out = html
  .replace(/<link[^>]+href="src\/app\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script[^>]+type="module"[^>]+src="src\/app\.js"[^>]*><\/script>/, () => `${dataScript}\n<script>\n(function(){\n${js}\n})();\n</script>`)
  .replace(/<link[^>]+rel="manifest"[^>]*>\s*/, '')
  .replace(/(<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]+href=")[^"]+(")/g, (m, a, b) => iconData ? a + iconData + b : '')
  .replace(/<script>[^<]*serviceWorker[^<]*<\/script>\s*/, '');
fs.mkdirSync(new URL('dist/', root), { recursive: true });
if (LITE) out = out.replace(/<title>Peace Meal<\/title>/, '<title>Peace Meal for one</title>').replace(/one table, everyone's funky dietary needs, every recommendation cited/, 'your meals, your symptoms, your doctor report, every recommendation cited');
if (PAGES) {
  const dir = LITE ? 'dist/pages/lite/' : 'dist/pages/full/';
  const name = LITE ? 'Peace Meal for one' : 'Peace Meal';
  fs.mkdirSync(new URL(dir, root), { recursive: true });
  // hosted copy: real icon files and a manifest (iOS ignores SVG and data: touch icons), plus the service worker
  out = out
    .replace(/<link rel="icon"[^>]*>\s*/, '<link rel="icon" href="icon-180.png" type="image/png">\n<link rel="manifest" href="manifest.webmanifest">\n')
    .replace(/<link rel="apple-touch-icon"[^>]*>\s*/, `<link rel="apple-touch-icon" href="icon-180.png">\n<meta name="apple-mobile-web-app-title" content="${name}">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="default">\n`)
    ;
  // The breathe page is inlined as data and also contains </body>, so only the document's own closing tag (the last one) gets the service worker script.
  const bodyEnd = out.lastIndexOf('</body>');
  const swReg = `<script>\nif ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {\n  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });\n}\n</script>\n`;
  out = out.slice(0, bodyEnd) + swReg + out.slice(bodyEnd);
  fs.writeFileSync(new URL(dir + 'index.html', root), out);
  fs.writeFileSync(new URL(dir + 'manifest.webmanifest', root), JSON.stringify({
    name, short_name: name, description: LITE ? 'Your meals, your symptoms, your doctor report. Data stays on this phone.' : 'One table, everyone\'s dietary needs, every recommendation cited. Data stays on this device.',
    start_url: './', scope: './', display: 'standalone', background_color: '#FBFAF7', theme_color: '#3D5A3C',
    icons: [{ src: 'icon-180.png', sizes: '180x180', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }]
  }, null, 2));
  for (const f of ['icon-180.png', 'icon-512.png']) fs.copyFileSync(new URL(f, root), new URL(dir + f, root));
  // Service worker: network first so an update lands on the next open when online; the cached copy serves offline.
  // __BUILD__ is stamped by the Pages workflow with the commit, so each deploy gets a fresh cache.
  fs.writeFileSync(new URL(dir + 'sw.js', root), `const VERSION = 'pm-pages-__BUILD__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil((async () => { const c = await caches.open(VERSION); await Promise.all(SHELL.map(u => c.add(u).catch(() => null))); self.skipWaiting(); })()); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VERSION);
    try { const fresh = await fetch(req); if (fresh && fresh.ok) c.put(req, fresh.clone()); return fresh; }
    catch { const hit = await c.match(req) || (req.mode === 'navigate' ? await c.match('./index.html') : null); if (hit) return hit; throw new Error('offline and not cached'); }
  })());
});
`);
  console.log(dir, (out.length / 1024).toFixed(0) + ' KB');
} else {
  const outName = LITE ? 'dist/peace-meal-lite.html' : 'dist/nutrition-app.html';
  fs.writeFileSync(new URL(outName, root), out);
  console.log(outName, (out.length / 1024).toFixed(0) + ' KB');
}
