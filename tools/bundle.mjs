// Builds dist/nutrition-app.html: one self-contained file (app + data inlined) that runs from a file:// URL, a phone, or an artifact.
// It rewrites ES module imports into a single classic script by concatenating modules in dependency order.
import fs from 'node:fs';
import path from 'node:path';
const root = new URL('../', import.meta.url);
const R = p => fs.readFileSync(new URL(p, root), 'utf8');

const order = ['src/engine/dictionary.js', 'src/engine/nutrition.js', 'src/engine/plan.js', 'src/engine/checker.js', 'src/engine/planner.js', 'src/engine/grocery.js', 'src/engine/screen.js', 'src/store.js'];
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

const data = {};
for (const f of ['sources', 'conditions', 'dictionaries', 'foods', 'recipes']) {
  const p = new URL('data/' + f + '.json', root);
  data[f] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : (f === 'dictionaries' ? { tags: {}, entries: [] } : []);
}
const html = R('index.html');
const css = fs.existsSync(new URL('src/app.css', root)) ? R('src/app.css') : '';
let js = '';
for (const f of [...order, ...uiFiles, appFile]) {
  if (!fs.existsSync(new URL(f, root))) continue;
  js += `\n/* ---- ${f} ---- */\n` + stripModuleSyntax(R(f)) + '\n';
}
const dataScript = `<script>window.__APP_DATA__ = ${JSON.stringify(data).replace(/<\/script/gi, '<\\/script')};</script>`;
let out = html
  .replace(/<link[^>]+href="src\/app\.css"[^>]*>/, `<style>\n${css}\n</style>`)
  .replace(/<script[^>]+type="module"[^>]+src="src\/app\.js"[^>]*><\/script>/, `${dataScript}\n<script>\n(function(){\n${js}\n})();\n</script>`)
  .replace(/<link[^>]+rel="manifest"[^>]*>\s*/, '')
  .replace(/<script>[^<]*serviceWorker[^<]*<\/script>\s*/, '');
fs.mkdirSync(new URL('dist/', root), { recursive: true });
fs.writeFileSync(new URL('dist/nutrition-app.html', root), out);
console.log('dist/nutrition-app.html', (out.length / 1024).toFixed(0) + ' KB');
