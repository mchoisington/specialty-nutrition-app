// Today: a daily diary. Calorie target (an estimate, labeled as such), meals with computed nutrients, favorites,
// weight log with a chart, and an exercise log. Everything is summed from foods.json by grams; nothing is guessed.
import { energyTarget, ACTIVITIES, ACTIVITY_LEVELS, activityCalories, kgToLb, lbToKg } from '../engine/energy.js';
import { nutrientsForGrams, recipeTotals, scaleTotals, addTotals, emptyTotals, compareToPlan, round, NUTRIENT_KEYS } from '../engine/nutrition.js';
import { checkRecipe, checkFood } from '../engine/checker.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiModal, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiSegmented } from './common.js';
import { weekGet } from './week.js';

const TODAY_MEALS = [{ id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'snacks', label: 'Snacks' }];
const TODAY_TRACKED = ['protein_g', 'carb_g', 'fiber_g', 'sodium_mg', 'satfat_g'];
const TODAY_CSS = `
.today-datebar { display:flex; align-items:center; gap:.5rem; margin-bottom:.75rem; }
.today-datebar input[type=date] { flex:1; min-width:0; }
.today-bar { height:14px; border-radius:999px; background:var(--surface-2); overflow:hidden; border:1px solid var(--border); margin:.4rem 0; }
.today-bar > span { display:block; height:100%; background:var(--accent); }
.today-bar.over > span { background:var(--red); }
.today-nut { display:grid; grid-template-columns: 1fr auto auto; gap:.2rem .75rem; font-size:.9rem; margin-top:.5rem; }
.today-nut .h { color:var(--muted); font-size:.8rem; text-transform:uppercase; letter-spacing:.03em; }
.today-nut .num { text-align:right; }
.today-entry { display:flex; gap:.5rem; align-items:flex-start; padding:.5rem 0; border-top:1px solid var(--border); }
.today-entry .main { flex:1; min-width:0; }
.today-entry .acts { display:flex; gap:.25rem; flex-wrap:wrap; justify-content:flex-end; }
.today-heart { background:none; border:0; font:inherit; font-size:1.25rem; line-height:1; cursor:pointer; color:var(--muted); padding:.2rem .35rem; min-height:32px; }
.today-heart.on { color:var(--red); }
.today-result { display:flex; gap:.5rem; align-items:center; border-top:1px solid var(--border); padding:.35rem 0; }
.today-result > button.pick { flex:1; text-align:left; background:none; border:0; font:inherit; color:var(--text); padding:.4rem .25rem; min-height:44px; cursor:pointer; }
.today-result > button.pick:hover { background:var(--surface-2); }
.today-chip { display:inline-flex; align-items:center; min-height:36px; padding:.2rem .8rem; border:1px solid var(--border); border-radius:999px; background:var(--surface); color:var(--text); font:inherit; font-weight:600; cursor:pointer; }
.today-chip.on { background:var(--blue-bg); border-color:var(--blue); color:var(--blue); }
.today-chart { width:100%; height:auto; display:block; margin-top:.5rem; }
.today-chart text { font-size:11px; fill:var(--muted); }
.today-chart .axis { stroke:var(--border); }
.today-chart .line { stroke:var(--accent); fill:none; stroke-width:2; }
.today-chart .pt { fill:var(--accent); }
.today-list { list-style:none; padding:0; margin:.5rem 0 0; }
.today-list li { display:flex; justify-content:space-between; gap:.5rem; padding:.35rem 0; border-top:1px solid var(--border); font-size:.95rem; }
.today-row { display:flex; gap:.5rem; align-items:flex-end; flex-wrap:wrap; }
.today-row .field { margin-bottom:0; flex:1; min-width:120px; }
`;

let todayUi = { date: null, personId: null };

function todayStyle() {
  if (document.getElementById('today-style')) return;
  const s = document.createElement('style'); s.id = 'today-style'; s.textContent = TODAY_CSS; document.head.appendChild(s);
}

function todayShiftDate(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  return uiIsoDate(new Date(y, m - 1, d + n));
}
function todayNewId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function todayEnsure(person) {
  const p = uiState.profile;
  for (const k of ['diary', 'weights', 'exercise']) if (!Array.isArray(p[k])) p[k] = [];
  if (!person.favorites) person.favorites = { recipes: [], foods: [] };
  person.favorites.recipes = person.favorites.recipes || [];
  person.favorites.foods = person.favorites.foods || [];
  if (!person.goals) person.goals = { calorie_target: 'off', deficit: 500 };
}

function todayPlain(t) { const o = {}; for (const k of NUTRIENT_KEYS) o[k] = round(t[k] || 0, 2); return o; }

// Nutrients for one diary entry, computed from foods.json by grams at save time.
export function todayNutrientsFor(entry) {
  if (entry.kind === 'recipe') {
    const r = uiState.recipesById.get(entry.ref);
    if (!r) return todayPlain(emptyTotals());
    return todayPlain(scaleTotals(recipeTotals(r, uiState.foodsById).perServing, Number(entry.amount) || 0));
  }
  if (entry.kind === 'food') {
    const f = uiState.foodsById.get(entry.ref);
    if (!f) return todayPlain(emptyTotals());
    return todayPlain(nutrientsForGrams(f, Number(entry.grams) || 0));
  }
  const t = emptyTotals();
  for (const k of NUTRIENT_KEYS) if (entry.nutrients && entry.nutrients[k] != null) t[k] = Number(entry.nutrients[k]) || 0;
  return todayPlain(t);
}

export function todayEntryName(entry) {
  if (entry.kind === 'recipe') { const r = uiState.recipesById.get(entry.ref); return r ? r.name : entry.ref; }
  if (entry.kind === 'food') { const f = uiState.foodsById.get(entry.ref); return f ? (f.short || f.name) : entry.ref; }
  return entry.name || 'Custom entry';
}
function todayAmountText(entry) {
  if (entry.kind === 'recipe') return `${uiFmtNum(entry.amount, 2)} serving${Number(entry.amount) === 1 ? '' : 's'}`;
  if (entry.kind === 'food') return entry.unit && entry.unit !== 'g' ? `${uiFmtNum(entry.amount, 2)} x ${entry.unit} (${uiFmtNum(entry.grams)} g)` : `${uiFmtNum(entry.grams)} g`;
  return 'as entered';
}

// Adds a diary entry for a person and persists it. Used here and by the Week screen's "Add to Today".
export function todayAddDiaryEntry(person, { date, meal, kind, ref, amount = 1, unit = 'serving', grams = null, note = '', name = '', nutrients = null }) {
  todayEnsure(person);
  const entry = { id: todayNewId('d'), date, person: person.id, meal: meal === 'snack' ? 'snacks' : meal, kind, ref, amount, unit, grams, note, name };
  if (kind === 'custom') entry.nutrients = nutrients || {};
  entry.nutrients = todayNutrientsFor(entry);
  uiState.profile.diary.push(entry);
  uiPersist();
  return entry;
}

export function todayIsFavorite(person, kind, id) {
  const f = person.favorites || {};
  return ((kind === 'recipe' ? f.recipes : f.foods) || []).includes(id);
}
export function todayToggleFavorite(person, kind, id) {
  todayEnsure(person);
  const list = kind === 'recipe' ? person.favorites.recipes : person.favorites.foods;
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1); else list.push(id);
  uiPersist();
  return i < 0;
}

function todayEntries(person, date) { return (uiState.profile.diary || []).filter(e => e.person === person.id && e.date === date); }
function todaySum(entries) { let t = emptyTotals(); for (const e of entries) { const x = emptyTotals(); for (const k of NUTRIENT_KEYS) x[k] = (e.nutrients && e.nutrients[k]) || 0; t = addTotals(t, x); } return t; }
function todayLatestWeightKg(person) {
  const ws = (uiState.profile.weights || []).filter(w => w.person === person.id).sort((a, b) => b.date.localeCompare(a.date));
  return ws.length ? ws[0].kg : person.weight_kg;
}

// What the target is, or why there is none.
export function todayTargetInfo(person, plan) {
  const g = person.goals || { calorie_target: 'off' };
  if (plan && plan.isDisabled('calorie-targets')) {
    const by = (plan.disabledFeatures || []).find(f => f.feature === 'calorie-targets');
    return { state: 'disabled', by: by && by.by ? (Array.isArray(by.by) ? by.by.join(', ') : String(by.by)) : 'a rule in your plan' };
  }
  if (g.calorie_target === 'off') return { state: 'off' };
  if (g.calorie_target === 'manual') return { state: 'ok', kcal: Number(person.manual_kcal) || 0, notes: ['You entered this number yourself.'], manual: true };
  const missing = [];
  if (!person.sex) missing.push('sex');
  if (!(Number(person.age) > 0)) missing.push('age');
  if (!(Number(person.weight_kg) > 0)) missing.push('weight');
  if (!(Number(person.height_cm) > 0)) missing.push('height');
  if (missing.length) return { state: 'missing', missing };
  const t = energyTarget({ ...person, weight_kg: todayLatestWeightKg(person) || person.weight_kg }, { goal: g.calorie_target, deficit: g.deficit });
  if (t.kcal == null) return { state: 'missing', missing: ['sex', 'age', 'weight', 'height'] };
  return { state: 'ok', kcal: t.kcal, notes: t.notes, tdee: t.tdee, ree: t.ree };
}

export function renderTodayScreen(root) {
  todayStyle();
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  todayEnsure(person);
  const today = uiIsoDate(uiToday());
  if (!todayUi.date || todayUi.personId !== person.id) todayUi = { date: today, personId: person.id };
  const date = todayUi.date;
  const entries = todayEntries(person, date);
  const totals = todaySum(entries);
  const exercise = (uiState.profile.exercise || []).filter(e => e.person === person.id && e.date === date);
  const exerciseKcal = exercise.reduce((s, e) => s + (Number(e.kcal) || 0), 0);

  root.innerHTML = `
    <h1>Today</h1>
    <div class="today-datebar">
      <button class="btn small" type="button" id="today-prev" aria-label="Previous day">&larr;</button>
      <input type="date" id="today-date" value="${uiEsc(date)}" aria-label="Date">
      <button class="btn small" type="button" id="today-next" aria-label="Next day">&rarr;</button>
    </div>
    <p class="small muted" style="margin-top:-.5rem">${uiFmtDate(date)}${date === today ? ' (today)' : ''} for ${uiEsc(person.name)}.</p>
    ${todayTargetCardHTML(person, plan, totals, exerciseKcal)}
    ${todayMealsHTML(person, plan, entries)}
    ${todayWeightHTML(person)}
    ${todayExerciseHTML(person, exercise, exerciseKcal)}
  `;
  todayBind(root, person, plan, date, entries);
}

function todayTargetCardHTML(person, plan, totals, exerciseKcal) {
  const info = todayTargetInfo(person, plan);
  const cmp = compareToPlan(totals, plan);
  const rows = TODAY_TRACKED.map(n => {
    const over = cmp.over.find(x => x.nutrient === n), under = cmp.under.find(x => x.nutrient === n), ok = cmp.ok.find(x => x.nutrient === n);
    const val = uiFmtNum(totals[n], n === 'sodium_mg' ? 0 : 1);
    let ref = '<span class="muted">no number in plan</span>', cls = '';
    if (over) { ref = `over (at most ${uiFmtNum(over.limit, 1)})`; cls = 'over'; }
    else if (under) { ref = `under (at least ${uiFmtNum(under.min, 1)})`; cls = 'under'; }
    else if (ok) { ref = ok.limit != null ? `at most ${uiFmtNum(ok.limit, 1)}` : ok.min != null ? `at least ${uiFmtNum(ok.min, 1)}` : 'within plan'; cls = 'ok'; }
    return `<span>${uiEsc(uiNutrientLabel(n))}</span><span class="num">${val}</span><span class="${cls}">${ref}</span>`;
  }).join('');
  const satPct = cmp.over.find(x => x.nutrient === 'satfat_pct_kcal') || cmp.ok.find(x => x.nutrient === 'satfat_pct_kcal');
  const nutTable = `<div class="today-nut" aria-label="Nutrients versus plan"><span class="h">Nutrient</span><span class="h num">Today</span><span class="h">Plan</span>${rows}${satPct ? `<span>${uiEsc(uiNutrientLabel('satfat_pct_kcal'))}</span><span class="num">${uiFmtNum(satPct.value, 1)}%</span><span class="${satPct.limit != null && satPct.value > satPct.limit ? 'over' : 'ok'}">at most ${uiFmtNum(satPct.limit, 0)}%</span>` : ''}</div>
    <p class="small muted" style="margin-bottom:0">Summed from USDA values by grams for what you logged. Foods missing a nutrient value count as zero for that nutrient.</p>`;
  let body = '';
  if (info.state === 'disabled') {
    body = `<p>Calorie targets are turned off because of <strong>${uiEsc(info.by)}</strong>. The plan still checks foods and meals; there is no daily calorie number to chase.</p>
      <p class="small muted">Today: ${uiFmtNum(totals.kcal)} kcal logged.</p>`;
  } else if (info.state === 'off') {
    body = `<p>No calorie target is set. The diary still adds up what you eat and compares protein, carbohydrate, fiber, sodium, and saturated fat against your plan. A calorie target is optional and is always an estimate.</p>
      <p><strong>${uiFmtNum(totals.kcal)} kcal</strong> logged today.</p>
      <button class="btn primary" type="button" id="today-set-target">Set a calorie target</button>`;
  } else if (info.state === 'missing') {
    body = `<p>The estimate needs <strong>${info.missing.join(', ')}</strong> on the person record. <a href="#/people/${uiEsc(person.id)}">Add it on the People screen</a>, or enter your own number.</p>
      <p><strong>${uiFmtNum(totals.kcal)} kcal</strong> logged today.</p>
      <div class="btn-row"><button class="btn" type="button" id="today-set-target">Change target</button></div>`;
  } else {
    const count = !!(person.goals && person.goals.count_exercise);
    const target = info.kcal + (count ? exerciseKcal : 0);
    const diff = target - totals.kcal;
    const pct = target > 0 ? Math.min(100, totals.kcal / target * 100) : 0;
    const overCls = totals.kcal > target ? 'over' : '';
    const goalWord = info.manual ? 'your own number' : person.goals.calorie_target === 'loss' ? `weight loss, ${person.goals.deficit || 500} kcal a day below maintenance` : 'maintain weight';
    body = `<div class="row between"><div><strong style="font-size:1.4rem">${uiFmtNum(totals.kcal)}</strong> of <strong>${uiFmtNum(target)}</strong> kcal <span class="badge gray outline">estimate</span></div>
        <span class="${overCls || 'ok'}">${diff >= 0 ? `${uiFmtNum(diff)} kcal under` : `${uiFmtNum(-diff)} kcal over`}</span></div>
      <div class="today-bar ${overCls}" role="img" aria-label="${uiFmtNum(pct)} percent of the estimated target"><span style="width:${pct}%"></span></div>
      <p class="small muted" style="margin:.25rem 0">Goal: ${goalWord}.${count && exerciseKcal ? ` Includes ${uiFmtNum(exerciseKcal)} kcal of exercise added back today.` : ''} The number is an estimate from a published equation, not a measurement; appetite, sleep, and how you feel matter too.</p>
      <details><summary>How this was estimated</summary><ul class="small">${(info.notes || []).map(n => `<li>${uiEsc(n)}</li>`).join('')}<li>Resting energy: Mifflin-St Jeor equation (Mifflin 1990), multiplied by an activity factor. Errors of 10 percent or more for an individual are normal.</li></ul></details>
      <div class="btn-row"><button class="btn small" type="button" id="today-set-target">Change target</button></div>`;
  }
  return `<section class="card" aria-labelledby="today-target-h"><h2 id="today-target-h">Calories and nutrients</h2>${body}${nutTable}</section>`;
}

function todayMealsHTML(person, plan, entries) {
  return `<section aria-labelledby="today-meals-h">
    <div class="row between"><h2 id="today-meals-h">Meals</h2><div class="row"><button class="btn small" type="button" id="today-copy-yesterday">Copy yesterday</button><button class="btn small" type="button" id="today-from-plan">Add from this week's plan</button></div></div>
    ${TODAY_MEALS.map(m => {
      const list = entries.filter(e => e.meal === m.id);
      const kcal = list.reduce((s, e) => s + ((e.nutrients && e.nutrients.kcal) || 0), 0);
      return `<div class="card tight">
        <div class="row between"><h3 style="margin:0">${m.label} <span class="small muted" style="font-weight:400">${list.length ? uiFmtNum(kcal) + ' kcal' : ''}</span></h3><button class="btn small primary" type="button" data-add="${m.id}">Add</button></div>
        ${list.map(e => {
          const fav = e.kind !== 'custom' && todayIsFavorite(person, e.kind, e.ref);
          const n = e.nutrients || {};
          return `<div class="today-entry">
            ${e.kind !== 'custom' ? `<button class="today-heart ${fav ? 'on' : ''}" type="button" data-fav="${e.kind}:${uiEsc(e.ref)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${fav ? '&#9829;' : '&#9825;'}</button>` : '<span style="width:1.9rem"></span>'}
            <div class="main"><div><strong>${uiEsc(todayEntryName(e))}</strong> <span class="small muted">${uiEsc(todayAmountText(e))}</span></div>
              <div class="small muted">${uiFmtNum(n.kcal)} kcal · ${uiFmtNum(n.protein_g, 1)} g protein · ${uiFmtNum(n.carb_g, 1)} g carb · ${uiFmtNum(n.fiber_g, 1)} g fiber · ${uiFmtNum(n.sodium_mg)} mg sodium · ${uiFmtNum(n.satfat_g, 1)} g sat fat</div>
              ${e.note ? `<div class="small">${uiEsc(e.note)}</div>` : ''}</div>
            <div class="acts"><button class="btn small" type="button" data-edit="${uiEsc(e.id)}">Edit</button><button class="btn small danger" type="button" data-remove="${uiEsc(e.id)}">Remove</button></div>
          </div>`;
        }).join('') || '<p class="small muted" style="margin:.4rem 0 0">Nothing logged.</p>'}
      </div>`;
    }).join('')}
  </section>`;
}

function todayWeightHTML(person) {
  const all = (uiState.profile.weights || []).filter(w => w.person === person.id).sort((a, b) => a.date.localeCompare(b.date));
  const last30 = all.slice(-30).reverse();
  const cutoff = todayShiftDate(uiIsoDate(uiToday()), -90);
  const chart = all.filter(w => w.date >= cutoff);
  return `<section class="card" aria-labelledby="today-weight-h"><h2 id="today-weight-h">Weight</h2>
    <div class="today-row"><div class="field"><label for="today-weight-lb">Weight (lb)</label><input id="today-weight-lb" type="number" inputmode="decimal" min="50" max="900" step="0.1" placeholder="${all.length ? kgToLb(all[all.length - 1].kg) : '150'}"></div><button class="btn primary" type="button" id="today-log-weight">Log weight</button></div>
    <p class="small muted">Stored in kilograms for the rules that need it; shown in pounds. Logging a weight updates the calorie estimate.</p>
    ${chart.length ? todayChartSVG(chart) : '<p class="small muted">No weights in the last 90 days to chart.</p>'}
    ${last30.length ? `<details><summary>Last ${last30.length} entr${last30.length === 1 ? 'y' : 'ies'}</summary><ul class="today-list">${last30.map(w => `<li><span>${uiFmtDate(w.date)}</span><span>${kgToLb(w.kg)} lb <span class="muted small">(${w.kg} kg)</span> <button class="btn link small" type="button" data-del-weight="${uiEsc(w.date)}" style="min-height:auto">Delete</button></span></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

function todayChartSVG(points) {
  const W = 360, H = 160, L = 44, R = 12, T = 12, B = 26;
  const lbs = points.map(p => kgToLb(p.kg));
  let lo = Math.min(...lbs), hi = Math.max(...lbs);
  if (hi - lo < 4) { lo -= 2; hi += 2; }
  lo = Math.floor(lo); hi = Math.ceil(hi);
  const d0 = new Date(points[0].date + 'T00:00:00').getTime(), d1 = new Date(points[points.length - 1].date + 'T00:00:00').getTime();
  const span = Math.max(1, d1 - d0);
  const x = p => points.length === 1 ? (L + W - R) / 2 : L + (new Date(p.date + 'T00:00:00').getTime() - d0) / span * (W - L - R);
  const y = lb => T + (hi - lb) / (hi - lo) * (H - T - B);
  const mid = Math.round((lo + hi) / 2);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(kgToLb(p.kg)).toFixed(1)}`).join(' ');
  return `<svg class="today-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight over the last 90 days, ${lbs[0]} to ${lbs[lbs.length - 1]} pounds">
    <line class="axis" x1="${L}" y1="${T}" x2="${L}" y2="${H - B}"/><line class="axis" x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}"/>
    <line class="axis" x1="${L}" y1="${y(mid).toFixed(1)}" x2="${W - R}" y2="${y(mid).toFixed(1)}" stroke-dasharray="3 3"/>
    <text x="${L - 6}" y="${T + 4}" text-anchor="end">${hi}</text><text x="${L - 6}" y="${y(mid).toFixed(1)}" dy="4" text-anchor="end">${mid}</text><text x="${L - 6}" y="${H - B}" text-anchor="end">${lo}</text>
    <text x="${L}" y="${H - 8}">${uiEsc(uiFmtDate(points[0].date))}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${uiEsc(uiFmtDate(points[points.length - 1].date))}</text>
    <text x="6" y="${T + 4}" font-size="10">lb</text>
    <path class="line" d="${path}"/>
    ${points.map(p => `<circle class="pt" cx="${x(p).toFixed(1)}" cy="${y(kgToLb(p.kg)).toFixed(1)}" r="3"><title>${uiEsc(uiFmtDate(p.date))}: ${kgToLb(p.kg)} lb</title></circle>`).join('')}
  </svg>`;
}

function todayExerciseHTML(person, exercise, exerciseKcal) {
  const wkg = todayLatestWeightKg(person);
  const count = !!(person.goals && person.goals.count_exercise);
  return `<section class="card" aria-labelledby="today-ex-h"><h2 id="today-ex-h">Exercise</h2>
    ${exercise.length ? `<ul class="today-list">${exercise.map(e => `<li><span>${uiEsc(e.name || (ACTIVITIES.find(a => a.id === e.activity) || {}).label || e.activity)}${e.minutes ? `, ${e.minutes} min` : ''}</span><span>${e.kcal != null ? uiFmtNum(e.kcal) + ' kcal' : '<span class="muted">no estimate</span>'} <button class="btn link small" type="button" data-del-ex="${uiEsc(e.id)}" style="min-height:auto">Delete</button></span></li>`).join('')}</ul><p class="small muted">About ${uiFmtNum(exerciseKcal)} kcal today (estimate: MET x weight x hours, 2011 Compendium).</p>` : '<p class="small muted">Nothing logged.</p>'}
    <div class="today-row"><div class="field"><label for="today-ex-act">Activity</label><select id="today-ex-act">${ACTIVITIES.map(a => `<option value="${a.id}">${uiEsc(a.label)}</option>`).join('')}</select></div>
      <div class="field" style="max-width:120px"><label for="today-ex-min">Minutes</label><input id="today-ex-min" type="number" inputmode="numeric" min="1" max="600" value="30"></div>
      <button class="btn primary" type="button" id="today-add-ex">Add activity</button></div>
    <div class="hint" id="today-ex-est">${wkg ? '' : 'Log a weight to get a calorie estimate for activities.'}</div>
    <details style="margin-top:.5rem"><summary>Enter an activity by hand</summary>
      <div class="today-row"><div class="field"><label for="today-ex-name">Name</label><input id="today-ex-name" type="text" placeholder="Pickleball"></div><div class="field" style="max-width:120px"><label for="today-ex-kcal">Calories</label><input id="today-ex-kcal" type="number" inputmode="numeric" min="0" max="5000"></div><button class="btn" type="button" id="today-add-ex-manual">Add</button></div></details>
    <label class="choice" style="margin-top:.75rem"><input type="checkbox" id="today-count-ex" ${count ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Count exercise toward today's calories</span><div class="hint">Off by default. Activity estimates run high for many people; eating them back can cancel a deficit.</div></span></label>
  </section>`;
}

function todayBind(root, person, plan, date) {
  const go = d => { todayUi.date = d; uiState.rerender(); };
  root.querySelector('#today-prev').addEventListener('click', () => go(todayShiftDate(date, -1)));
  root.querySelector('#today-next').addEventListener('click', () => go(todayShiftDate(date, 1)));
  root.querySelector('#today-date').addEventListener('change', e => { if (e.target.value) go(e.target.value); });
  const tb = root.querySelector('#today-set-target');
  if (tb) tb.addEventListener('click', () => todayTargetModal(person, plan));
  root.querySelectorAll('[data-add]').forEach(b => b.addEventListener('click', () => todayAddModal(person, plan, date, b.dataset.add)));
  root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
    const [kind, id] = b.dataset.fav.split(':');
    const on = todayToggleFavorite(person, kind, id);
    uiToast(on ? 'Added to favorites.' : 'Removed from favorites.');
    uiState.rerender();
  }));
  root.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.diary = uiState.profile.diary.filter(e => e.id !== b.dataset.remove);
    uiPersist(); uiToast('Removed.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
    const e = uiState.profile.diary.find(x => x.id === b.dataset.edit);
    if (e) todayAmountModal(person, plan, { entry: e });
  }));
  root.querySelector('#today-copy-yesterday').addEventListener('click', () => {
    const prev = todayEntries(person, todayShiftDate(date, -1));
    if (!prev.length) { uiToast('Nothing was logged yesterday.'); return; }
    for (const e of prev) uiState.profile.diary.push({ ...e, id: todayNewId('d'), date, nutrients: { ...e.nutrients } });
    uiPersist(); uiToast(`Copied ${prev.length} entr${prev.length === 1 ? 'y' : 'ies'} from yesterday.`); uiState.rerender();
  });
  root.querySelector('#today-from-plan').addEventListener('click', () => {
    if (!uiState.data.recipes.length) { uiToast('No recipes loaded.'); return; }
    const week = weekGet(person, plan);
    const day = week.days.find(d => d.date === date);
    const meals = day ? day.meals.filter(m => m.recipe) : [];
    if (!meals.length) { uiToast('The week plan has no meals for this date.'); return; }
    for (const m of meals) todayAddDiaryEntry(person, { date, meal: m.slot, kind: 'recipe', ref: m.recipe, amount: 1, unit: 'serving' });
    uiToast(`Added ${meals.length} planned meal${meals.length === 1 ? '' : 's'}.`); uiState.rerender();
  });
  root.querySelector('#today-log-weight').addEventListener('click', () => {
    const lb = Number(root.querySelector('#today-weight-lb').value);
    const kg = lbToKg(lb);
    if (!kg) { uiToast('Enter a weight in pounds.'); return; }
    uiState.profile.weights = uiState.profile.weights.filter(w => !(w.person === person.id && w.date === date));
    uiState.profile.weights.push({ date, person: person.id, kg });
    person.weight_kg = kg;
    uiPersist(); uiToast(`Logged ${lb} lb (${kg} kg).`); uiState.rerender();
  });
  root.querySelectorAll('[data-del-weight]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.weights = uiState.profile.weights.filter(w => !(w.person === person.id && w.date === b.dataset.delWeight));
    uiPersist(); uiState.rerender();
  }));
  const est = root.querySelector('#today-ex-est');
  const updEst = () => {
    const wkg = todayLatestWeightKg(person);
    if (!wkg) return;
    const kcal = activityCalories(root.querySelector('#today-ex-act').value, Number(root.querySelector('#today-ex-min').value), wkg);
    est.textContent = kcal != null ? `About ${kcal} kcal (estimate for ${kgToLb(wkg)} lb).` : '';
  };
  root.querySelector('#today-ex-act').addEventListener('change', updEst);
  root.querySelector('#today-ex-min').addEventListener('input', updEst);
  updEst();
  root.querySelector('#today-add-ex').addEventListener('click', () => {
    const activity = root.querySelector('#today-ex-act').value;
    const minutes = Number(root.querySelector('#today-ex-min').value);
    if (!(minutes > 0)) { uiToast('Enter minutes.'); return; }
    const kcal = activityCalories(activity, minutes, todayLatestWeightKg(person));
    uiState.profile.exercise.push({ id: todayNewId('x'), date, person: person.id, activity, minutes, kcal });
    uiPersist(); uiToast(kcal != null ? `Added, about ${kcal} kcal.` : 'Added (no weight, so no calorie estimate).'); uiState.rerender();
  });
  root.querySelector('#today-add-ex-manual').addEventListener('click', () => {
    const name = root.querySelector('#today-ex-name').value.trim();
    const kcal = Number(root.querySelector('#today-ex-kcal').value);
    if (!name) { uiToast('Enter a name.'); return; }
    uiState.profile.exercise.push({ id: todayNewId('x'), date, person: person.id, activity: 'manual', name, minutes: null, kcal: kcal >= 0 ? Math.round(kcal) : null });
    uiPersist(); uiToast('Added.'); uiState.rerender();
  });
  root.querySelectorAll('[data-del-ex]').forEach(b => b.addEventListener('click', () => {
    uiState.profile.exercise = uiState.profile.exercise.filter(e => e.id !== b.dataset.delEx);
    uiPersist(); uiState.rerender();
  }));
  root.querySelector('#today-count-ex').addEventListener('change', e => {
    person.goals.count_exercise = e.target.checked;
    uiPersist(); uiState.rerender();
  });
}

function todayTargetModal(person, plan) {
  const g = person.goals || { calorie_target: 'off', deficit: 500 };
  const draft = { goal: g.calorie_target === 'off' ? 'maintain' : g.calorie_target, deficit: g.deficit || 500, manual: person.manual_kcal || '', activity: person.activity || 'light' };
  const m = uiModal(`
    <p class="small muted">A calorie target is an estimate from a published equation (Mifflin-St Jeor), not a prescription. It needs sex, age, weight, and height from the People screen.</p>
    <div class="field"><span class="label">Goal</span>${uiSegmented('today-goal', [{ value: 'maintain', label: 'Maintain' }, { value: 'loss', label: 'Lose weight' }, { value: 'manual', label: 'Enter my own number' }], draft.goal)}</div>
    <div class="field" id="today-goal-loss" ${draft.goal === 'loss' ? '' : 'hidden'}><label for="today-deficit">Daily deficit: <span id="today-deficit-val">${draft.deficit}</span> kcal</label><input id="today-deficit" type="range" min="500" max="750" step="50" value="${draft.deficit}"><div class="hint">Guidelines use 500 to 750 kcal a day below maintenance. The estimate never goes below 1,200 kcal.</div></div>
    <div class="field" id="today-goal-manual" ${draft.goal === 'manual' ? '' : 'hidden'}><label for="today-manual">Calories per day</label><input id="today-manual" type="number" inputmode="numeric" min="800" max="6000" value="${uiEsc(draft.manual)}"><div class="hint">Use the number your clinician or dietitian gave you.</div></div>
    <div class="field" id="today-goal-activity" ${draft.goal === 'manual' ? 'hidden' : ''}><label for="today-activity">Usual activity</label><select id="today-activity">${ACTIVITY_LEVELS.map(l => `<option value="${l.id}" ${l.id === draft.activity ? 'selected' : ''}>${uiEsc(l.label)}</option>`).join('')}</select></div>
    <div id="today-target-preview" class="notice info"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-target-save">Save</button>${g.calorie_target !== 'off' ? '<button class="btn" type="button" id="today-target-off">Turn off the target</button>' : ''}</div>
  `, { title: 'Calorie target' });
  if (!m) return;
  const el = m.el;
  const preview = () => {
    const box = el.querySelector('#today-target-preview');
    el.querySelector('#today-goal-loss').hidden = draft.goal !== 'loss';
    el.querySelector('#today-goal-manual').hidden = draft.goal !== 'manual';
    el.querySelector('#today-goal-activity').hidden = draft.goal === 'manual';
    if (draft.goal === 'manual') { box.innerHTML = `<div class="notice-head">Info</div><div>${draft.manual ? uiFmtNum(draft.manual) + ' kcal a day, entered by you.' : 'Enter a number.'}</div>`; return; }
    const missing = [];
    if (!person.sex) missing.push('sex');
    if (!(Number(person.age) > 0)) missing.push('age');
    if (!(Number(person.weight_kg) > 0)) missing.push('weight');
    if (!(Number(person.height_cm) > 0)) missing.push('height');
    if (missing.length) { box.innerHTML = `<div class="notice-head">Info</div><div>Missing: <strong>${missing.join(', ')}</strong>. <a href="#/people/${uiEsc(person.id)}">Add it on the People screen</a>, then come back. You can still save the goal now.</div>`; return; }
    const t = energyTarget({ ...person, activity: draft.activity }, { goal: draft.goal, deficit: draft.deficit });
    box.innerHTML = `<div class="notice-head">Estimate</div><div><strong>${uiFmtNum(t.kcal)} kcal a day</strong></div><details><summary>Notes</summary><ul class="small">${t.notes.map(n => `<li>${uiEsc(n)}</li>`).join('')}</ul></details>`;
  };
  el.querySelectorAll('[data-seg="today-goal"]').forEach(r => r.addEventListener('change', () => { draft.goal = r.value; el.querySelectorAll('[data-seg="today-goal"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); preview(); }));
  el.querySelector('#today-deficit').addEventListener('input', e => { draft.deficit = Number(e.target.value); el.querySelector('#today-deficit-val').textContent = draft.deficit; preview(); });
  el.querySelector('#today-manual').addEventListener('input', e => { draft.manual = e.target.value; preview(); });
  el.querySelector('#today-activity').addEventListener('change', e => { draft.activity = e.target.value; preview(); });
  el.querySelector('#today-target-save').addEventListener('click', () => {
    if (draft.goal === 'manual' && !(Number(draft.manual) >= 800)) { uiToast('Enter at least 800 kcal, or pick another goal.'); return; }
    person.goals = { ...(person.goals || {}), calorie_target: draft.goal, deficit: draft.deficit };
    if (draft.goal === 'manual') person.manual_kcal = Math.round(Number(draft.manual));
    else person.activity = draft.activity;
    uiPersist(); m.close(); uiToast('Target saved.'); uiState.rerender();
  });
  const off = el.querySelector('#today-target-off');
  if (off) off.addEventListener('click', () => { person.goals = { ...(person.goals || {}), calorie_target: 'off' }; uiPersist(); m.close(); uiToast('Target turned off.'); uiState.rerender(); });
  preview();
}

function todaySearchItems(person, plan, query, favOnly) {
  const q = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const match = name => q.every(w => name.toLowerCase().includes(w));
  const favR = new Set(person.favorites.recipes), favF = new Set(person.favorites.foods);
  const items = [];
  for (const r of uiState.data.recipes) if (match(r.name) && (!favOnly || favR.has(r.id))) items.push({ kind: 'recipe', id: r.id, name: r.name, sub: `Recipe · ${r.active_min} min active · ${r.servings} servings`, fav: favR.has(r.id), obj: r });
  for (const f of uiState.data.foods) if (match(f.name + ' ' + (f.short || '')) && (!favOnly || favF.has(f.id))) items.push({ kind: 'food', id: f.id, name: f.short || f.name, sub: `Food · ${f.group || 'Other'}`, fav: favF.has(f.id), obj: f });
  items.sort((a, b) => Number(b.fav) - Number(a.fav));
  const out = items.slice(0, 40);
  for (const it of out) {
    const c = it.kind === 'recipe' ? checkRecipe(it.obj, plan, uiState.matcher, uiState.foodsById, person) : checkFood(it.obj, plan, uiState.matcher, person);
    it.verdict = c.verdict;
  }
  return { out, total: items.length };
}

function todayAddModal(person, plan, date, meal) {
  const state = { q: '', fav: false };
  const m = uiModal(`
    <div class="row"><input type="search" id="today-q" placeholder="Search recipes and foods" aria-label="Search recipes and foods" style="flex:1;min-width:0"><button class="today-chip" type="button" id="today-fav-chip" aria-pressed="false">&#9829; Favorites</button></div>
    <div id="today-results" style="margin-top:.5rem"></div>
    <details style="margin-top:.75rem"><summary>Custom entry (from a label)</summary>
      <div class="today-row"><div class="field"><label for="today-c-name">Name</label><input id="today-c-name" type="text"></div><div class="field" style="max-width:110px"><label for="today-c-kcal">kcal</label><input id="today-c-kcal" type="number" inputmode="numeric" min="0"></div></div>
      <div class="today-row" style="margin-top:.5rem"><div class="field"><label for="today-c-protein">Protein g</label><input id="today-c-protein" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-carb">Carb g</label><input id="today-c-carb" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-fiber">Fiber g</label><input id="today-c-fiber" type="number" inputmode="decimal" min="0"></div><div class="field"><label for="today-c-sodium">Sodium mg</label><input id="today-c-sodium" type="number" inputmode="numeric" min="0"></div><div class="field"><label for="today-c-satfat">Sat fat g</label><input id="today-c-satfat" type="number" inputmode="decimal" min="0"></div></div>
      <div class="btn-row"><button class="btn" type="button" id="today-c-add">Add custom entry</button></div><p class="small muted">Custom entries are not checked against your plan's avoid rules; only their numbers count.</p></details>
  `, { title: `Add to ${(TODAY_MEALS.find(x => x.id === meal) || { label: meal }).label}` });
  if (!m) return;
  const el = m.el;
  const results = el.querySelector('#today-results');
  const draw = () => {
    const { out, total } = todaySearchItems(person, plan, state.q, state.fav);
    results.innerHTML = out.length ? `<p class="small muted" style="margin:0 0 .25rem">${total} match${total === 1 ? '' : 'es'}${total > out.length ? ', showing the first ' + out.length : ''}. Favorites first.</p>` + out.map(it => `<div class="today-result">
      <button class="today-heart ${it.fav ? 'on' : ''}" type="button" data-fav="${it.kind}:${uiEsc(it.id)}" aria-pressed="${it.fav}" aria-label="${it.fav ? 'Remove from favorites' : 'Add to favorites'}">${it.fav ? '&#9829;' : '&#9825;'}</button>
      <button class="pick" type="button" data-pick="${it.kind}:${uiEsc(it.id)}"><span class="dot ${it.verdict}" aria-hidden="true"></span><span class="visually-hidden">${uiVerdictWord(it.verdict)}: </span><strong>${uiEsc(it.name)}</strong><br><span class="small muted">${uiEsc(it.sub)}</span></button>
    </div>`).join('') : `<p class="empty">${state.fav ? 'No favorites match. Tap the heart on any recipe or food to add one.' : 'No recipe or food matches.'}</p>`;
    results.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => { const [k, id] = b.dataset.fav.split(':'); todayToggleFavorite(person, k, id); draw(); }));
    results.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { const [k, id] = b.dataset.pick.split(':'); m.close(); todayAmountModal(person, plan, { date, meal, kind: k, ref: id }); }));
  };
  el.querySelector('#today-q').addEventListener('input', e => { state.q = e.target.value; draw(); });
  el.querySelector('#today-fav-chip').addEventListener('click', e => { state.fav = !state.fav; e.currentTarget.classList.toggle('on', state.fav); e.currentTarget.setAttribute('aria-pressed', String(state.fav)); draw(); });
  el.querySelector('#today-c-add').addEventListener('click', () => {
    const name = el.querySelector('#today-c-name').value.trim();
    if (!name) { uiToast('Enter a name.'); return; }
    const num = id => { const v = el.querySelector(id).value; return v === '' ? 0 : Number(v); };
    todayAddDiaryEntry(person, { date, meal, kind: 'custom', ref: null, amount: 1, unit: 'entry', name, nutrients: { kcal: num('#today-c-kcal'), protein_g: num('#today-c-protein'), carb_g: num('#today-c-carb'), fiber_g: num('#today-c-fiber'), sodium_mg: num('#today-c-sodium'), satfat_g: num('#today-c-satfat') } });
    m.close(); uiToast('Added.'); uiState.rerender();
  });
  draw();
  el.querySelector('#today-q').focus();
}

// Amount form for a recipe (servings) or a food (portion or grams). Also used to edit an existing entry.
function todayAmountModal(person, plan, { date, meal, kind, ref, entry = null }) {
  if (entry) { date = entry.date; meal = entry.meal; kind = entry.kind; ref = entry.ref; }
  if (kind === 'custom') { todayCustomEditModal(entry); return; }
  const obj = kind === 'recipe' ? uiState.recipesById.get(ref) : uiState.foodsById.get(ref);
  if (!obj) { uiToast('Not found in the data files.'); return; }
  const name = kind === 'recipe' ? obj.name : (obj.short || obj.name);
  const portions = kind === 'food' ? (obj.portions || []).filter(p => p.grams > 0) : [];
  const draft = entry ? { amount: entry.amount, unit: entry.unit, grams: entry.grams, meal: entry.meal, note: entry.note || '' }
    : kind === 'recipe' ? { amount: 1, unit: 'serving', grams: null, meal, note: '' }
      : { amount: 1, unit: portions.length ? portions[0].label : 'g', grams: portions.length ? portions[0].grams : 100, meal, note: '' };
  if (kind === 'food' && draft.unit === 'g') draft.amount = draft.grams;
  const check = kind === 'recipe' ? checkRecipe(obj, plan, uiState.matcher, uiState.foodsById, person) : checkFood(obj, plan, uiState.matcher, person);
  const m = uiModal(`
    <div class="row"><span class="badge ${check.verdict === 'fail' ? 'red' : check.verdict === 'caution' ? 'amber' : 'green'}">${uiVerdictWord(check.verdict)}</span> ${check.hits.length ? `<span class="small">Matches: ${check.hits.map(h => uiEsc(h.label) + (h.hard ? ' (hard)' : '')).join(', ')}</span>` : '<span class="small muted">No avoid tags matched.</span>'}</div>
    ${check.verdict === 'fail' ? '<div class="notice block"><div class="notice-head">Stop</div><div>This has a hard exclusion for this person. You can still record that it was eaten, but it is not allowed by the plan.</div></div>' : ''}
    <div class="field"><label for="today-a-meal">Meal</label><select id="today-a-meal">${TODAY_MEALS.map(x => `<option value="${x.id}" ${x.id === draft.meal ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
    ${kind === 'recipe' ? `<div class="field"><label for="today-a-amount">Servings (recipe makes ${obj.servings})</label><input id="today-a-amount" type="number" inputmode="decimal" min="0.5" step="0.5" value="${uiEsc(draft.amount)}"></div>`
    : `<div class="today-row"><div class="field"><label for="today-a-unit">Portion</label><select id="today-a-unit">${portions.map(p => `<option value="${uiEsc(p.label)}" data-grams="${p.grams}" ${draft.unit === p.label ? 'selected' : ''}>${uiEsc(p.label)} (${p.grams} g)</option>`).join('')}<option value="g" ${draft.unit === 'g' ? 'selected' : ''}>grams</option></select></div>
      <div class="field" style="max-width:130px"><label for="today-a-amount" id="today-a-amount-l">${draft.unit === 'g' ? 'Grams' : 'How many'}</label><input id="today-a-amount" type="number" inputmode="decimal" min="0" step="${draft.unit === 'g' ? '1' : '0.25'}" value="${uiEsc(draft.amount)}"></div></div>
      ${portions.length ? `<div class="btn-row" style="margin-top:0"><button class="btn small" type="button" id="today-a-one">1 serving (${uiEsc(portions[0].label)})</button></div>` : ''}`}
    <div class="field"><label for="today-a-note">Note (optional)</label><input id="today-a-note" type="text" value="${uiEsc(draft.note)}"></div>
    <div class="notice info" id="today-a-preview"></div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-a-save">${entry ? 'Save changes' : 'Add'}</button></div>
  `, { title: name });
  if (!m) return;
  const el = m.el;
  const compute = () => {
    draft.meal = el.querySelector('#today-a-meal').value;
    draft.note = el.querySelector('#today-a-note').value;
    const amt = Number(el.querySelector('#today-a-amount').value) || 0;
    if (kind === 'recipe') { draft.amount = amt; draft.unit = 'serving'; draft.grams = null; }
    else {
      const sel = el.querySelector('#today-a-unit');
      const opt = sel.options[sel.selectedIndex];
      draft.unit = sel.value;
      draft.amount = amt;
      draft.grams = sel.value === 'g' ? amt : amt * Number(opt.dataset.grams || 0);
    }
    const n = todayNutrientsFor({ kind, ref, amount: draft.amount, grams: draft.grams });
    el.querySelector('#today-a-preview').innerHTML = `<div class="notice-head">This entry</div><div>${uiFmtNum(n.kcal)} kcal · ${uiFmtNum(n.protein_g, 1)} g protein · ${uiFmtNum(n.carb_g, 1)} g carb · ${uiFmtNum(n.fiber_g, 1)} g fiber · ${uiFmtNum(n.sodium_mg)} mg sodium · ${uiFmtNum(n.satfat_g, 1)} g saturated fat${kind === 'food' ? ` · ${uiFmtNum(draft.grams)} g` : ''}</div>`;
    return n;
  };
  el.querySelector('#today-a-amount').addEventListener('input', compute);
  el.querySelector('#today-a-note').addEventListener('input', compute);
  el.querySelector('#today-a-meal').addEventListener('change', compute);
  const unitSel = el.querySelector('#today-a-unit');
  if (unitSel) unitSel.addEventListener('change', () => {
    const g = unitSel.value === 'g';
    el.querySelector('#today-a-amount-l').textContent = g ? 'Grams' : 'How many';
    const inp = el.querySelector('#today-a-amount');
    inp.step = g ? '1' : '0.25';
    inp.value = g ? String(draft.grams || 100) : '1';
    compute();
  });
  const one = el.querySelector('#today-a-one');
  if (one) one.addEventListener('click', () => { unitSel.value = portions[0].label; el.querySelector('#today-a-amount').value = '1'; el.querySelector('#today-a-amount-l').textContent = 'How many'; compute(); });
  el.querySelector('#today-a-save').addEventListener('click', () => {
    const n = compute();
    if (!(draft.amount > 0)) { uiToast('Enter an amount.'); return; }
    if (entry) {
      Object.assign(entry, { meal: draft.meal, amount: draft.amount, unit: draft.unit, grams: draft.grams, note: draft.note, nutrients: n });
      uiPersist(); m.close(); uiToast('Saved.'); uiState.rerender();
    } else {
      todayAddDiaryEntry(person, { date, meal: draft.meal, kind, ref, amount: draft.amount, unit: draft.unit, grams: draft.grams, note: draft.note });
      m.close(); uiToast(`Added ${name}.`); uiState.rerender();
    }
  });
  compute();
}

function todayCustomEditModal(entry) {
  const n = entry.nutrients || {};
  const m = uiModal(`
    <div class="field"><label for="today-ce-name">Name</label><input id="today-ce-name" type="text" value="${uiEsc(entry.name || '')}"></div>
    <div class="field"><label for="today-ce-meal">Meal</label><select id="today-ce-meal">${TODAY_MEALS.map(x => `<option value="${x.id}" ${x.id === entry.meal ? 'selected' : ''}>${x.label}</option>`).join('')}</select></div>
    <div class="today-row">${[['kcal', 'kcal'], ['protein_g', 'Protein g'], ['carb_g', 'Carb g'], ['fiber_g', 'Fiber g'], ['sodium_mg', 'Sodium mg'], ['satfat_g', 'Sat fat g']].map(([k, l]) => `<div class="field"><label for="today-ce-${k}">${l}</label><input id="today-ce-${k}" type="number" inputmode="decimal" min="0" value="${uiEsc(n[k] ?? 0)}"></div>`).join('')}</div>
    <div class="btn-row"><button class="btn primary" type="button" id="today-ce-save">Save changes</button></div>`, { title: 'Edit custom entry' });
  if (!m) return;
  m.el.querySelector('#today-ce-save').addEventListener('click', () => {
    entry.name = m.el.querySelector('#today-ce-name').value.trim() || entry.name;
    entry.meal = m.el.querySelector('#today-ce-meal').value;
    const nut = { ...n };
    for (const k of ['kcal', 'protein_g', 'carb_g', 'fiber_g', 'sodium_mg', 'satfat_g']) nut[k] = Number(m.el.querySelector('#today-ce-' + k).value) || 0;
    entry.nutrients = todayNutrientsFor({ kind: 'custom', nutrients: nut });
    uiPersist(); m.close(); uiToast('Saved.'); uiState.rerender();
  });
}
