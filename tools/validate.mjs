// Validates every data file against the contracts in docs/PHASE-2. Exits non-zero on any failure.
import fs from 'node:fs';
const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);

const sources = read('data/sources.json');
const conditions = read('data/conditions.json');
const dictionaries = read('data/dictionaries.json');
const foods = fs.existsSync(new URL('../data/foods.json', import.meta.url)) ? read('data/foods.json') : [];
const recipes = fs.existsSync(new URL('../data/recipes.json', import.meta.url)) ? read('data/recipes.json') : [];
const articles = fs.existsSync(new URL('../data/articles.json', import.meta.url)) ? read('data/articles.json') : {};

const sourceIds = new Set(sources.map(s => s.id));
for (const s of sources) { if (!s.id || !s.citation) err(`source missing id/citation: ${JSON.stringify(s).slice(0, 80)}`); }
const dupS = sources.map(s => s.id).filter((x, i, a) => a.indexOf(x) !== i); if (dupS.length) err('duplicate source ids: ' + dupS.join(', '));

const tagIds = new Set(Object.keys(dictionaries.tags || {}));
const proposed = new Set((conditions.proposed_tags || dictionaries.proposed_tags || []).map(t => typeof t === 'string' ? t : t.tag));
const knownTag = t => tagIds.has(t) || proposed.has(t);
for (const [tag, def] of Object.entries(dictionaries.tags || {})) {
  if (!def.label) err(`tag ${tag} missing label`);
  if (!Array.isArray(def.sources) || !def.sources.length) warn(`tag ${tag} has no sources`);
  for (const s of def.sources || []) if (!(dictionaries.sources && dictionaries.sources[s]) && !sourceIds.has(s)) err(`tag ${tag} cites unknown source ${s}`);
}
const seenTerms = new Set();
for (const e of dictionaries.entries || []) {
  const k = String(e.term).toLowerCase();
  if (seenTerms.has(k)) err(`duplicate dictionary term: ${e.term}`); seenTerms.add(k);
  for (const t of e.tags || []) if (!knownTag(t)) err(`entry "${e.term}" uses undeclared tag ${t}`);
  if (e.match && !['word', 'phrase', 'substring'].includes(e.match)) err(`entry "${e.term}" bad match mode ${e.match}`);
  if (e.match === 'substring' && String(e.term).length < 5) err(`entry "${e.term}" substring match on a short token is unsafe`);
}

const modList = Array.isArray(conditions) ? conditions : conditions.modules || [];
const modIds = new Set(modList.map(m => m.id));
const ruleIds = new Set();
const nutrients = new Set(['kcal','protein_g','carb_g','fiber_g','sugar_g','added_sugar_g','fat_g','satfat_g','transfat_g','cholesterol_mg','sodium_mg','potassium_mg','phosphorus_mg','calcium_mg','iron_mg','magnesium_mg','vitamin_c_mg','vitamin_d_iu','vitamin_b12_ug','folate_ug','zinc_mg','iodine_ug','caffeine_mg','alcohol_g','fluid_ml','purine_est','satfat_pct_kcal','added_sugar_pct_kcal','carb_pct_kcal','fiber_g_per_1000kcal']);
for (const m of modList) {
  if (!m.id || !m.name || !m.category) err(`module missing id/name/category: ${m.id}`);
  if (!m.evidence || !m.evidence.rating) err(`module ${m.id} missing evidence.rating`);
  if (!Array.isArray(m.sources) || !m.sources.length) err(`module ${m.id} has no sources`);
  for (const s of m.sources || []) if (!sourceIds.has(s)) err(`module ${m.id} cites unknown source ${s}`);
  if (!m.education || !m.education.plain) warn(`module ${m.id} has no education.plain`);
  for (const r of m.rules || []) {
    if (!r.id) err(`module ${m.id} has a rule without id`);
    if (ruleIds.has(r.id)) err(`duplicate rule id ${r.id}`); ruleIds.add(r.id);
    if (!r.kind || !r.text) err(`rule ${r.id} missing kind/text`);
    if (!Array.isArray(r.sources) || !r.sources.length) err(`rule ${r.id} has no sources`);
    for (const s of r.sources || []) if (!sourceIds.has(s)) err(`rule ${r.id} cites unknown source ${s}`);
    if ((r.kind === 'limit' || r.kind === 'target') && r.nutrient && !nutrients.has(r.nutrient)) err(`rule ${r.id} uses unknown nutrient ${r.nutrient}`);
    if ((r.kind === 'limit' || r.kind === 'target') && r.nutrient && r.tier !== 2 && typeof r.value !== 'number' && !(r.op === 'range' && typeof r.min === 'number')) err(`rule ${r.id} numeric rule without numeric value`);
    if ((r.kind === 'avoid' || r.kind === 'prefer') && (!Array.isArray(r.tags) || !r.tags.length)) err(`rule ${r.id} ${r.kind} without tags`);
    for (const t of r.tags || []) if (!knownTag(t)) err(`rule ${r.id} uses undeclared tag ${t}`);
    if (r.tier === 2 && !(m.tier2 || []).length) warn(`rule ${r.id} is tier 2 but module ${m.id} declares no tier2 params`);
  }
  for (const c of m.conflicts || []) if (!modIds.has(c.with)) err(`module ${m.id} conflict with unknown module ${c.with}`);
  for (const p of m.phases || []) for (const rid of p.rules || []) if (!(m.rules || []).some(r => r.id === rid)) err(`module ${m.id} phase ${p.id} references unknown rule ${rid}`);
  for (const x of m.modes || []) for (const rid of x.rules || []) if (!(m.rules || []).some(r => r.id === rid)) err(`module ${m.id} mode ${x.id} references unknown rule ${rid}`);
}

const foodIds = new Set(foods.map(f => f.id));
for (const f of foods) {
  if (!f.id || !f.fdcId || !f.name || !f.per100g) err(`food malformed: ${f.id}`);
  if (!Array.isArray(f.portions) || !f.portions.length) err(`food ${f.id} has no portions`);
  for (const t of f.tags || []) if (!knownTag(t)) err(`food ${f.id} uses undeclared tag ${t}`);
}
const recipeIds = new Set();
for (const r of recipes) {
  if (recipeIds.has(r.id)) err(`duplicate recipe id ${r.id}`); recipeIds.add(r.id);
  if (!r.name || !r.servings || !Array.isArray(r.ingredients) || !r.ingredients.length) err(`recipe ${r.id} malformed`);
  if (typeof r.active_min !== 'number' || typeof r.total_min !== 'number') err(`recipe ${r.id} missing times`);
  if (!['beginner', 'comfortable', 'confident'].includes(r.skill)) err(`recipe ${r.id} bad skill`);
  for (const ing of r.ingredients || []) { if (!foodIds.has(ing.food)) err(`recipe ${r.id} references unknown food ${ing.food}`); if (!(Number(ing.grams) > 0)) err(`recipe ${r.id} ingredient ${ing.food} has no grams`); }
  for (const t of r.tags || []) if (!knownTag(t)) err(`recipe ${r.id} uses undeclared tag ${t}`);
  if (Object.keys(r).some(k => /nutri|kcal|sodium/i.test(k))) err(`recipe ${r.id} carries nutrient numbers; nutrients are computed, not stored`);
}

for (const m of modList) {
  const a = articles[m.id];
  if (!a) { warn(`module ${m.id} has no article`); continue; }
  if (!Array.isArray(a.summary) || a.summary.length < 3) err(`article ${m.id} summary too short`);
  if (!Array.isArray(a.sections) || !a.sections.length) err(`article ${m.id} has no sections`);
  for (const r of a.references || []) { if (!r.url || /\s/.test(r.url) || !/^https:\/\//.test(r.url)) err(`article ${m.id} reference ${r.id} has a bad url`); }
  for (const sid of m.sources || []) if (!(a.references || []).some(r => r.id === sid)) warn(`article ${m.id} does not list module source ${sid}`);
}
console.log(`sources ${sources.length}, modules ${modList.length}, rules ${ruleIds.size}, tags ${tagIds.size}, dictionary entries ${(dictionaries.entries || []).length}, foods ${foods.length}, recipes ${recipes.length}, articles ${Object.keys(articles).length}`);
for (const w of warnings) console.log('WARN ' + w);
for (const e of errors) console.log('ERROR ' + e);
if (errors.length) { console.log(`${errors.length} error(s)`); process.exit(1); }
console.log('OK');
