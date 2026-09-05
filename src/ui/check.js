// Check: paste an ingredient list or search a food, get a verdict with the rules behind it.
import { checkText, checkFood } from '../engine/checker.js';
import { nutrientsForGrams, derived, round } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiRulesList, uiVerdictWord, uiNutrientLabel, uiFmtNum } from './common.js';

let checkLastText = '';

export function renderCheckScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const foods = uiState.data.foods;
  root.innerHTML = `
    <h1>Check</h1>
    <p class="muted">Checked against ${uiEsc(person.name)}'s plan. The dictionary matches exact terms; it does not guess. Anything it does not recognize is reported, not assumed safe.</p>
    <div class="card">
      <label for="check-text">Paste an ingredient list or type a food</label>
      <textarea id="check-text" placeholder="Ingredients: water, roasted peanuts, salt, natural flavors">${uiEsc(checkLastText)}</textarea>
      <div class="btn-row"><button class="btn primary" type="button" id="check-run">Check</button><button class="btn" type="button" id="check-clear">Clear</button></div>
    </div>
    <div class="card">
      <label for="check-search">Search foods (${foods.length} in the database)</label>
      <input id="check-search" type="search" placeholder="Start typing: peanut, yogurt, salmon" autocomplete="off" ${foods.length ? '' : 'disabled'}>
      <ul class="search-results" id="check-results" hidden></ul>
      ${foods.length ? '' : '<p class="small muted">The food database (data/foods.json) is not loaded.</p>'}
    </div>
    <div id="check-result" aria-live="polite" aria-atomic="true"></div>
  `;
  const ta = root.querySelector('#check-text');
  const out = root.querySelector('#check-result');
  root.querySelector('#check-run').addEventListener('click', () => {
    checkLastText = ta.value;
    if (!ta.value.trim()) { out.innerHTML = '<p class="muted">Type or paste something first.</p>'; return; }
    const r = checkText(ta.value, plan, uiState.matcher, person);
    out.innerHTML = checkResultHTML(r, person, plan, { title: 'Ingredient text' });
  });
  ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') root.querySelector('#check-run').click(); });
  root.querySelector('#check-clear').addEventListener('click', () => { ta.value = ''; checkLastText = ''; out.innerHTML = ''; ta.focus(); });

  const search = root.querySelector('#check-search');
  const results = root.querySelector('#check-results');
  if (search) search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
    const words = q.split(/\s+/);
    const hits = foods.filter(f => { const n = (f.name + ' ' + (f.short || '')).toLowerCase(); return words.every(w => n.includes(w)); }).slice(0, 12);
    results.innerHTML = hits.length ? hits.map(f => `<li><button type="button" data-food="${uiEsc(f.id)}"><strong>${uiEsc(f.short || f.name)}</strong><br><span class="small muted">${uiEsc(f.name)} · ${uiEsc(f.group || '')}</span></button></li>`).join('') : '<li><button type="button" disabled>No matching food.</button></li>';
    results.hidden = false;
    results.querySelectorAll('[data-food]').forEach(b => b.addEventListener('click', () => {
      const food = uiState.foodsById.get(b.dataset.food);
      if (!food) return;
      const r = checkFood(food, plan, uiState.matcher, person);
      out.innerHTML = checkResultHTML(r, person, plan, { title: food.short || food.name, food });
      results.hidden = true;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  });
}

export function checkResultHTML(r, person, plan, opts = {}) {
  const hasAllergens = !!(person.allergens && person.allergens.length);
  const strict = !!(person.preferences && person.preferences.may_contain_strict);
  const mayContain = opts.food ? false : /may contain|shared (facility|equipment)|processed in a facility|manufactured (in|on)/i.test(checkLastText);
  let verdict = r.verdict;
  if (strict && mayContain && verdict === 'pass') verdict = 'caution';
  const unrec = r.unrecognized || [];
  const headline = verdict === 'fail' ? 'Contains a hard exclusion.' : verdict === 'caution' ? (unrec.length && hasAllergens && !r.hits.length ? 'Some ingredients were not recognized.' : 'Something here needs a look.') : 'Nothing in the plan flags this.';
  return `
    <div class="verdict ${verdict}" role="${verdict === 'fail' ? 'alert' : 'status'}">
      <div class="verdict-word">${uiVerdictWord(verdict)}</div>
      <div><strong>${uiEsc(opts.title || '')}</strong>${opts.food && opts.food.group ? ` <span class="muted small">${uiEsc(opts.food.group)}</span>` : ''}</div>
      <div>${headline}</div>
      ${unrec.length && hasAllergens ? '<div style="margin-top:.5rem"><strong>Some ingredients were not recognized.</strong> With an allergen on file, that alone is a caution.</div>' : ''}
      ${strict && mayContain ? '<div style="margin-top:.5rem"><strong>"May contain" or shared-facility wording found.</strong> You asked to treat this as a stop.</div>' : ''}
    </div>
    ${r.hits.length ? `<h2>Matches</h2>${r.hits.map(h => `<div class="card tight">
        <div class="row"><strong>${uiEsc(h.label)}</strong> ${h.hard ? '<span class="badge red">hard stop</span>' : '<span class="badge amber">soft</span>'} ${h.terms && h.terms.length ? `<span class="small muted">matched: ${h.terms.map(uiEsc).join(', ')}</span>` : ''}</div>
        <details><summary>Rules behind this (${h.rules.length})</summary>${uiRulesList(h.rules)}</details>
      </div>`).join('')}` : ''}
    ${(r.termHits || []).length ? `<h2>Your avoid words</h2><div class="card tight">${r.termHits.map(t => `<div class="row"><strong>${uiEsc(t.term)}</strong> <span class="badge amber">soft</span> <span class="small muted">personal preference</span></div>`).join('')}</div>` : ''}
    ${(r.unknownRisk || []).length ? `<h2>Terms that can hide something</h2><div class="card tight">${r.unknownRisk.map(u => `<div class="rule"><strong>${uiEsc(u.term)}</strong>${u.segment ? ` <span class="small muted">in "${uiEsc(u.segment)}"</span>` : ''}<div class="small">${uiEsc(u.note || 'This term does not say what it contains.')}</div></div>`).join('')}</div>` : ''}
    ${(r.notes || []).length ? `<h2>Portion notes</h2><div class="card tight">${r.notes.map(n => `<div class="rule"><strong>${uiEsc(n.term)}</strong><div class="small">${uiEsc(n.note)}</div></div>`).join('')}</div>` : ''}
    ${unrec.length ? `<h2>Not recognized</h2><div class="card tight"><p><strong>Not recognized:</strong> ${unrec.map(uiEsc).join('; ')}.</p><p class="small muted" style="margin:0">The app does not assume these are safe. Check the label yourself or add the term to the dictionary.</p></div>` : ''}
    ${(r.preferHits || []).length ? `<h2>Fits a preference</h2><div class="card tight"><div class="row">${r.preferHits.map(p => `<span class="badge green">${uiEsc(p.label)}</span>`).join(' ')}</div></div>` : ''}
    ${opts.food ? checkFoodNutrientsHTML(opts.food, plan) : ''}
    ${opts.food && opts.food.tags && opts.food.tags.length ? `<p class="small muted">Tags: ${opts.food.tags.map(t => `<code>${uiEsc(t)}</code>`).join(' ')}</p>` : ''}
    ${opts.food && opts.food.fdcId ? `<p class="small muted">USDA FoodData Central ID ${uiEsc(opts.food.fdcId)}${opts.food.dataset ? ` (${uiEsc(opts.food.dataset)})` : ''}. Numbers are per the USDA file, never estimated.</p>` : ''}
  `;
}

function checkFoodNutrientsHTML(food, plan) {
  const keys = [...new Set([...Object.keys(plan.limits || {}), ...Object.keys(plan.targets || {})])];
  if (!keys.length) return '<p class="small muted">No nutrient limits or targets are active in the plan, so no per-portion comparison is shown.</p>';
  const portion = (food.portions || []).find(p => p.grams && p.grams !== 100) || (food.portions || [])[0] || null;
  const per100 = nutrientsForGrams(food, 100);
  const perPortion = portion ? nutrientsForGrams(food, portion.grams) : null;
  const d100 = derived(per100);
  const dPortion = perPortion ? derived(perPortion) : null;
  const rows = keys.map(k => {
    const lim = plan.limits[k];
    const tg = plan.targets[k];
    const daily = lim ? lim.value : tg ? tg.min : null;
    const isPct = /_pct_kcal$/.test(k);
    const v100 = isPct ? d100[k] : per100[k];
    const vPortion = perPortion ? (isPct ? dPortion[k] : perPortion[k]) : null;
    const missing = per100._missing && per100._missing[k];
    const pct = vPortion != null && daily && !isPct ? round(vPortion / daily * 100) : null;
    const cls = pct == null ? '' : lim ? (pct > 100 ? 'over' : '') : (pct >= 100 ? 'ok' : '');
    return `<tr><td>${uiEsc(uiNutrientLabel(k))}</td><td class="num">${missing ? '<span class="muted">no data</span>' : uiFmtNum(v100, 1)}</td><td class="num">${perPortion ? (missing ? '<span class="muted">no data</span>' : uiFmtNum(vPortion, 1)) : ''}</td><td class="num">${daily != null ? uiFmtNum(daily, 1) : ''}${lim && lim.clinician || tg && tg.clinician ? ' <span class="badge blue">clinician-set</span>' : ''}</td><td class="num ${cls}">${pct != null ? pct + '%' : ''}</td></tr>`;
  }).join('');
  return `<h2>Nutrients that matter for this plan</h2><div class="table-wrap"><table>
    <thead><tr><th>Nutrient</th><th class="num">Per 100 g</th><th class="num">${portion ? 'Per ' + uiEsc(portion.label) + ' (' + portion.grams + ' g)' : 'Per portion'}</th><th class="num">Daily number</th><th class="num">% of daily (portion)</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="small muted">"no data" means the USDA record has no value for that nutrient; the app does not fill it in.</p>`;
}
