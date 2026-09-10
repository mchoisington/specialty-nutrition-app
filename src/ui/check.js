// Check: paste an ingredient list or search a food, get a verdict with the rules behind it.
import { checkText, checkFood } from '../engine/checker.js';
import { nutrientsForGrams, derived, round } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiRulesList, uiVerdictWord, uiNutrientLabel, uiFmtNum, uiPageHeader, uiSection, uiChip, uiModal, uiIcon, uiEmptyState } from './common.js';

let checkLastText = '';
let checkLastRules = [];

// Runs Tesseract (open-source OCR) in the browser. Loaded on first use from a CDN; nothing about the photo leaves the device.
let checkOcrLoading = null;
function checkLoadOcr() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (checkOcrLoading) return checkOcrLoading;
  checkOcrLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js';
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('reader did not load'));
    s.onerror = () => reject(new Error('reader blocked'));
    document.head.appendChild(s);
  });
  return checkOcrLoading;
}
async function checkReadImage(file, onProgress) {
  const T = await checkLoadOcr();
  const worker = await T.createWorker('eng', 1, { logger: m => { if (m.status === 'recognizing text' && onProgress) onProgress(Math.round((m.progress || 0) * 100)); } });
  try { const { data } = await worker.recognize(file); return data.text || ''; } finally { await worker.terminate(); }
}

export function renderCheckScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const foods = uiState.data.foods;
  root.innerHTML = `
    ${uiPageHeader('Check a food', `Two questions, both answered against ${uiEsc(person.name)}'s plan. Anything the app does not recognize is reported, never assumed safe.`)}
    <div class="card">
      <h2>Is this product okay?</h2>
      <p class="small muted">Copy the ingredient list off a package (or type a dish) and get a plain answer: fine, caution, or no, and why.</p>
      <label for="check-text" class="visually-hidden">Ingredient list</label>
      <textarea id="check-text" placeholder="Ingredients: water, roasted peanuts, salt, natural flavors">${uiEsc(checkLastText)}</textarea>
      <div class="btn-row"><button class="btn primary" type="button" id="check-run">${uiIcon('check')}Check this list</button><label class="btn" for="check-photo">${uiIcon('search')}Photo of the label</label><input id="check-photo" type="file" accept="image/*" capture="environment" class="visually-hidden"><button class="btn" type="button" id="check-clear">Clear</button></div>
      <p class="small muted" id="check-ocr-status">Photo of the label reads the ingredient text off a picture and puts it in the box for you to check. Needs the internet the first time (it fetches a small reader), and works in the downloaded app, not the claude.ai link. Your phone's camera can do the same: point it at the label, tap the text, Copy, then paste here.</p>
    </div>
    <div class="card">
      <h2>What is in one food?</h2>
      <p class="small muted">Look up a single food to see its numbers (sodium, potassium, sugar, fiber, and whatever else ${uiEsc(person.name)}'s plan watches) and whether it fits. Same ${uiFmtNum(foods.length)} foods Today uses when you log a meal.</p>
      <label for="check-search" class="visually-hidden">Look up a food</label>
      <input id="check-search" type="search" placeholder="Type a food: banana, Greek yogurt, canned tuna" autocomplete="off" ${foods.length ? '' : 'disabled'}>
      <ul class="search-results" id="check-results" hidden></ul>
      ${foods.length ? '' : '<p class="small muted">The food database (data/foods.json) is not loaded.</p>'}
    </div>
    <div id="check-result" aria-live="polite" aria-atomic="true" class="stack-2"></div>
  `;
  const ta = root.querySelector('#check-text');
  const out = root.querySelector('#check-result');
  const show = html => { out.innerHTML = html; checkBindResult(out); };
  root.querySelector('#check-run').addEventListener('click', () => {
    checkLastText = ta.value;
    if (!ta.value.trim()) { show(uiEmptyState('Type or paste something first.', '', 'list')); return; }
    const r = checkText(ta.value, plan, uiState.matcher, person);
    show(checkResultHTML(r, person, plan, { title: 'Ingredient text' }));
  });
  ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') root.querySelector('#check-run').click(); });
  root.querySelector('#check-clear').addEventListener('click', () => { ta.value = ''; checkLastText = ''; out.innerHTML = ''; ta.focus(); });
  root.querySelector('#check-photo').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const status = root.querySelector('#check-ocr-status');
    status.textContent = 'Reading the label...';
    try {
      const text = await checkReadImage(file, pct => { status.textContent = `Reading the label... ${pct}%`; });
      const cleaned = text.replace(/\s+/g, ' ').trim();
      if (!cleaned) { status.textContent = 'Could not read any text. Try a closer, flatter, better-lit photo, or copy the text with your phone camera.'; return; }
      ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + cleaned;
      checkLastText = ta.value;
      status.textContent = 'Text added. Look it over, fix anything the camera misread, then tap Check this list.';
      ta.focus();
    } catch (err) {
      status.textContent = 'The label reader could not load here (' + (err && err.message ? err.message : 'no internet or blocked') + '). Use your phone camera to copy the text, then paste it above.';
    } finally { e.target.value = ''; }
  });

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
      show(checkResultHTML(r, person, plan, { title: food.short || food.name, food }));
      results.hidden = true;
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  });
}

// Wires the "why" links (rules behind a match) to a sheet.
export function checkBindResult(root) {
  root.querySelectorAll('[data-why]').forEach(b => b.addEventListener('click', () => {
    const h = checkLastRules[Number(b.dataset.why)];
    if (!h) return;
    uiModal(`<p class="small muted">${h.hard ? 'A hard stop: never overridden by a preference, a mode, or an acknowledgment.' : 'A soft rule: shown as a caution; your call.'}</p>${uiRulesList(h.rules)}`, { title: `Why: ${h.label}` });
  }));
}

export function checkResultHTML(r, person, plan, opts = {}) {
  const hasAllergens = !!(person.allergens && person.allergens.length);
  const verdict = r.verdict;
  const unrec = r.unrecognized || [];
  const headline = verdict === 'fail' ? 'Contains a hard exclusion.' : verdict === 'caution' ? (unrec.length && hasAllergens && !r.hits.length ? 'Some ingredients were not recognized.' : 'Something here needs a look.') : 'Nothing in the plan flags this.';
  checkLastRules = r.hits.slice();
  return `
    <div class="verdict ${verdict}" role="${verdict === 'fail' ? 'alert' : 'status'}">
      <div class="verdict-word">${uiVerdictWord(verdict)}</div>
      <div class="verdict-reason">${headline}</div>
      <div class="small"><strong>${uiEsc(opts.title || '')}</strong>${opts.food && opts.food.group ? ` <span class="muted">${uiEsc(opts.food.group)}</span>` : ''}</div>
      ${unrec.length && hasAllergens ? '<div class="small"><strong>Some ingredients were not recognized.</strong> With an allergen on file, that alone is a caution.</div>' : ''}
    </div>
    ${r.hits.length ? uiSection('Matches', `<div class="list boxed">${r.hits.map((h, i) => `<div class="match-row">
        ${uiChip(h.hard ? 'hard stop' : 'soft', h.hard ? 'stop' : 'caution')}
        <div><strong>${uiEsc(h.label)}</strong>${h.terms && h.terms.length ? `<div class="match-term">matched: ${h.terms.map(uiEsc).join(', ')}</div>` : ''}</div>
        <button class="btn link small" type="button" data-why="${i}">Why (${h.rules.length})</button>
      </div>`).join('')}</div>`, { id: 'check-matches-h' }) : ''}
    ${(r.termHits || []).length ? uiSection('Your avoid words', `<div class="list boxed">${r.termHits.map(t => `<div class="match-row">${uiChip('soft', 'caution')}<div><strong>${uiEsc(t.term)}</strong><div class="match-term">personal preference</div></div><span></span></div>`).join('')}</div>`, { id: 'check-terms-h' }) : ''}
    ${(r.unknownRisk || []).length ? uiSection('Terms that can hide something', `<div class="list boxed">${r.unknownRisk.map(u => `<div class="rule"><strong>${uiEsc(u.term)}</strong>${u.segment ? ` <span class="small muted">in "${uiEsc(u.segment)}"</span>` : ''}<div class="small">${uiEsc(u.note || 'This term does not say what it contains.')}</div></div>`).join('')}</div>`, { id: 'check-hide-h' }) : ''}
    ${(r.notes || []).length ? uiSection('Portion notes', `<div class="list boxed">${r.notes.map(n => `<div class="rule"><strong>${uiEsc(n.term)}</strong><div class="small">${uiEsc(n.note)}</div></div>`).join('')}</div>`, { id: 'check-notes-h' }) : ''}
    ${unrec.length ? uiSection('Not recognized', `<ul class="small">${unrec.map(u => `<li>${uiEsc(u)}</li>`).join('')}</ul><p class="small muted">The app does not assume these are safe. Check the label yourself or add the term to the dictionary.</p>`, { id: 'check-unrec-h' }) : ''}
    ${(r.preferHits || []).length ? uiSection('Fits a preference', `<div class="chip-cloud">${r.preferHits.map(p => uiChip(p.label, 'pass')).join('')}</div>`, { id: 'check-prefer-h' }) : ''}
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
    const word = pct == null ? '' : lim ? (pct > 100 ? ' over' : '') : (pct >= 100 ? ' met' : '');
    return `<tr><td>${uiEsc(uiNutrientLabel(k))}</td><td class="num">${missing ? '<span class="muted">no data</span>' : uiFmtNum(v100, 1)}</td><td class="num">${perPortion ? (missing ? '<span class="muted">no data</span>' : uiFmtNum(vPortion, 1)) : ''}</td><td class="num">${daily != null ? uiFmtNum(daily, 1) : ''}${lim && lim.clinician || tg && tg.clinician ? ' ' + uiChip('doctor or dietitian', 'plum') : ''}</td><td class="num ${cls}">${pct != null ? pct + '%' + word : ''}</td></tr>`;
  }).join('');
  return uiSection('Nutrients that matter for this plan', `<div class="table-wrap"><table>
    <thead><tr><th>Nutrient</th><th class="num">Per 100 g</th><th class="num">${portion ? 'Per ' + uiEsc(portion.label) + ' (' + portion.grams + ' g)' : 'Per portion'}</th><th class="num">Daily number</th><th class="num">% of daily (portion)</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <p class="small muted">"no data" means the USDA record has no value for that nutrient; the app does not fill it in.</p>`, { id: 'check-nut-h' });
}
