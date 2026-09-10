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
const data = {};
for (const f of ['sources', 'conditions', 'dictionaries', 'foods', 'recipes', 'recipes-open', 'recipes-usda', 'articles', 'swaps']) {
  const p = new URL('data/' + f + '.json', root);
  data[f] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : (f === 'dictionaries' ? { tags: {}, entries: [] } : f === 'articles' ? {} : f === 'swaps' ? { families: {}, swaps: [] } : []);
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
const outName = LITE ? 'dist/peace-meal-lite.html' : 'dist/nutrition-app.html';
fs.writeFileSync(new URL(outName, root), out);
console.log(outName, (out.length / 1024).toFixed(0) + ' KB');
