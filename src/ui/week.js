// Week: a 7-day plan from the planner, with swaps, logging, and recipe detail.
import { buildWeekPlan, scoreRecipe } from '../engine/planner.js';
import { checkRecipe } from '../engine/checker.js';
import { compareToPlan, recipeTotals, emptyTotals, addTotals, round } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiWeekKey, uiToday, uiIsoDate, uiFmtDate, uiFmtNum, uiNutrientLabel, uiModal, uiToast, uiVerdictWord, uiTagLabel } from './common.js';
import { grocerySyncChanges, grocerySetEaters } from './grocery.js';
import { todayAddDiaryEntry, todayIsFavorite, todayToggleFavorite } from './today.js';

const WEEK_SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const WEEK_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const WEEK_CSS = `
.week-heart { background:none; border:0; font:inherit; font-size:1.15rem; line-height:1; cursor:pointer; color:var(--muted); padding:.1rem .3rem; min-height:32px; vertical-align:middle; }
.week-heart.on { color:var(--red); }
.week-eaters { display:inline-flex; align-items:center; gap:.3rem; font-size:.85rem; color:var(--muted); margin-left:auto; }
.week-eaters input { width:64px; min-height:36px; padding:.2rem .4rem; }
@media (max-width: 520px) { .meal { grid-template-columns: 1fr; } .meal .meal-actions { justify-content: flex-start; } }
`;

function weekStyle() {
  if (document.getElementById('week-style')) return;
  const s = document.createElement('style'); s.id = 'week-style'; s.textContent = WEEK_CSS; document.head.appendChild(s);
}

export function weekGet(person, plan) {
  const key = uiWeekKey(person);
  if (uiState.weekCache.has(key)) return uiState.weekCache.get(key);
  const week = buildWeekPlan({ person, plan, recipes: uiState.data.recipes, foodsById: uiState.foodsById, matcher: uiState.matcher, startDate: uiToday(), seed: person.planSeed || 0 });
  weekApplyOverrides(week, person, plan);
  uiState.weekCache.set(key, week);
  return week;
}

function weekApplyOverrides(week, person, plan) {
  const overrides = (person.mealOverrides || {})[uiWeekKey(person)] || {};
  for (const [k, recipeId] of Object.entries(overrides)) {
    const [di, slot] = k.split(':');
    const day = week.days[Number(di)];
    const recipe = uiState.recipesById.get(recipeId);
    if (!day || !recipe) continue;
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal) continue;
    const check = checkRecipe(recipe, plan, uiState.matcher, uiState.foodsById, person);
    if (check.verdict === 'fail') continue;
    Object.assign(meal, { recipe: recipe.id, name: recipe.name, source: recipe.assembly_only ? 'assembly' : 'cook', servings: meal.servings || 1, servingsMade: meal.servings || 1, reasons: ['you chose this'], check: { verdict: check.verdict, hits: check.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: check.exceeds.map(e => e.nutrient) }, swapped: true });
  }
  for (const day of week.days) {
    let totals = emptyTotals();
    for (const m of day.meals) {
      const r = m.recipe ? uiState.recipesById.get(m.recipe) : null;
      if (r) totals = addTotals(totals, recipeTotals(r, uiState.foodsById).perServing);
    }
    day.totals = totals;
  }
}

export function renderWeekScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  if (!uiState.data.recipes.length) {
    root.innerHTML = '<h1>Week</h1><p class="empty">No recipes are loaded (data/recipes.json is missing or empty), so a week cannot be built.</p>';
    return;
  }
  weekStyle();
  const week = weekGet(person, plan);
  const budget = !!(person.cooking && person.cooking.budget);
  const household = Math.max(1, Number((person.cooking || {}).household) || 1);
  root.innerHTML = `
    <div class="row between"><h1>Week for ${uiEsc(person.name)}</h1><button class="btn" type="button" id="week-regen">Regenerate</button></div>
    <p class="muted small">Starting ${uiFmtDate(week.days[0].date)}. ${week.eligibleCount} of ${uiState.data.recipes.length} recipes are eligible. Meals are scheduled on the days you can cook; leftovers and assembly meals fill the rest. Every meal was checked against the plan.</p>
    <div class="row" style="margin-bottom:.75rem"><span class="badge ${budget ? 'green' : 'gray'} outline">Save money: ${budget ? 'on' : 'off'}</span><label class="small" style="display:inline-flex;align-items:center;gap:.4rem;min-height:36px"><input type="checkbox" id="week-budget" ${budget ? 'checked' : ''}> Prefer recipes that reuse this week's ingredients</label><span class="small muted">Household of ${household}.</span></div>
    ${week.unmet.length ? `<div class="notice warn"><div class="notice-head">Caution</div><div>${week.unmet.length} slot${week.unmet.length === 1 ? '' : 's'} could not be filled: ${week.unmet.map(u => `${uiFmtDate(u.date)} ${u.slot}`).join(', ')}. No recipe fit the plan for that slot.</div></div>` : ''}
    ${week.days.map((d, di) => weekDayHTML(d, di, plan, person)).join('')}
    <details class="card"><summary>Excluded recipes (${week.excluded.length})</summary>
      ${week.excluded.length ? `<ul>${week.excluded.map(x => `<li><strong>${uiEsc(x.name)}</strong>: hard exclusion${x.why.length ? ' on ' + x.why.map(uiEsc).join(', ') : ''}</li>`).join('')}</ul>` : '<p class="muted small">None.</p>'}
      <p class="small muted">Hard exclusions are allergens and any rule marked hard. They are never scheduled.</p></details>
  `;
  root.querySelector('#week-regen').addEventListener('click', () => {
    person.planSeed = (person.planSeed || 0) + 1;
    if (person.mealOverrides) delete person.mealOverrides[uiWeekKey(person)];
    uiPersist(); grocerySyncChanges(person, 'Regenerated week'); uiToast('New week generated.'); uiState.rerender();
  });
  root.querySelector('#week-budget').addEventListener('change', e => {
    person.cooking = person.cooking || {};
    person.cooking.budget = e.target.checked;
    uiPersist(); grocerySyncChanges(person, e.target.checked ? 'Turned on Save money' : 'Turned off Save money'); uiToast(e.target.checked ? 'Save money is on. The planner now favors recipes that share ingredients.' : 'Save money is off.'); uiState.rerender();
  });
  root.querySelectorAll('[data-eaters]').forEach(inp => inp.addEventListener('change', () => {
    const reason = grocerySetEaters(person, inp.dataset.eaters, inp.value, inp.dataset.day);
    if (reason) uiToast(reason + '. The week and grocery list were updated.');
    uiState.rerender();
  }));
  root.querySelectorAll('[data-fav]').forEach(b => b.addEventListener('click', () => {
    const on = todayToggleFavorite(person, 'recipe', b.dataset.fav);
    uiToast(on ? 'Added to favorites.' : 'Removed from favorites.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-today]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.today.split(':');
    const day = week.days[Number(di)];
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal || !meal.recipe) return;
    todayAddDiaryEntry(person, { date: day.date, meal: slot, kind: 'recipe', ref: meal.recipe, amount: 1, unit: 'serving' });
    uiToast(`Added ${meal.name} to ${uiFmtDate(day.date)} in Today.`);
  }));
  root.querySelectorAll('[data-recipe]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.recipe, person, plan)));
  root.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => weekSwapModal(Number(b.dataset.swap), b.dataset.slot, person, plan, week)));
  root.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', () => {
    const [di, slot] = b.dataset.log.split(':');
    const day = week.days[Number(di)];
    const meal = day.meals.find(m => m.slot === slot);
    if (!meal || !meal.recipe) return;
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push({ date: day.date, person: person.id, meal: slot, recipe: meal.recipe, name: meal.name, symptoms: {}, logged_at: new Date().toISOString() });
    uiPersist(); uiToast(`Logged ${meal.name} for ${slot}.`);
  }));
}

function weekDayHTML(d, di, plan, person) {
  const cmp = compareToPlan(d.totals, plan);
  const isToday = d.date === uiIsoDate(uiToday());
  return `<section class="card day" aria-labelledby="day-${di}">
    <div class="day-head"><h3 id="day-${di}">${uiFmtDate(d.date)}</h3>
      ${d.canCook ? '<span class="badge green">can cook</span>' : '<span class="badge gray">no cooking</span>'}
      <span class="small muted">${d.minutes} min per meal</span>
      <label class="week-eaters">Cooking for <input type="number" inputmode="numeric" min="1" max="20" value="${d.eaters}" data-eaters="${uiEsc(d.date)}" data-day="${uiEsc(d.day)}" aria-label="Eaters on ${uiEsc(uiFmtDate(d.date))}"> ${isToday ? 'today' : WEEK_DAY_NAMES[d.day] || ''}</label></div>
    ${d.meals.map(m => `<div class="meal">
      <div>
        <div class="slot">${WEEK_SLOT_LABEL[m.slot] || m.slot}</div>
        ${m.recipe ? `<div class="meal-name"><span class="dot ${m.check.verdict}" aria-hidden="true"></span><span class="visually-hidden">${uiVerdictWord(m.check.verdict)}: </span><button type="button" class="btn link" style="min-height:auto;padding:0;font-weight:600;text-align:left" data-recipe="${uiEsc(m.recipe)}">${uiEsc(m.name)}</button>${person ? `<button class="week-heart ${todayIsFavorite(person, 'recipe', m.recipe) ? 'on' : ''}" type="button" data-fav="${uiEsc(m.recipe)}" aria-pressed="${todayIsFavorite(person, 'recipe', m.recipe)}" aria-label="${todayIsFavorite(person, 'recipe', m.recipe) ? 'Remove from favorites' : 'Add to favorites'}">${todayIsFavorite(person, 'recipe', m.recipe) ? '&#9829;' : '&#9825;'}</button>` : ''}</div>
        <div class="small muted">${m.source === 'leftover' ? 'Leftovers' : m.source === 'assembly' ? 'Assembly, no cooking' : 'Cook'}${m.servingsMade && m.servingsMade > m.servings ? `, make ${m.servingsMade} servings` : ''}, ${m.servings} serving${m.servings === 1 ? '' : 's'} · <span class="badge ${m.check.verdict === 'fail' ? 'red' : m.check.verdict === 'caution' ? 'amber' : 'green'} outline">${uiVerdictWord(m.check.verdict)}</span>${m.swapped ? ' · swapped' : ''}</div>
        ${m.check.hits && m.check.hits.length ? `<div class="small">Caution: ${m.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}
        ${m.check.exceeds && m.check.exceeds.length ? `<div class="small">One serving exceeds the daily ${m.check.exceeds.map(uiNutrientLabel).map(uiEsc).join(', ')}.</div>` : ''}
        ${m.reasons && m.reasons.length || m.source === 'leftover' ? `<details><summary>Why this</summary><ul class="small">${m.source === 'leftover' ? '<li>Leftovers from a meal made earlier this week.</li>' : ''}${(m.reasons || []).map(r => `<li>${uiEsc(r)}</li>`).join('')}${m.reasons && !m.reasons.length && m.source !== 'leftover' ? '<li>Fits the plan, your time, skill, and equipment with no penalties.</li>' : ''}${m.score != null ? `<li class="muted">Score ${m.score}</li>` : ''}</ul></details>` : ''}` : '<div class="muted">No recipe fit this slot.</div>'}
      </div>
      <div class="meal-actions">
        <button class="btn small" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}">Swap</button>
        ${m.recipe ? `<button class="btn small" type="button" data-log="${di}:${uiEsc(m.slot)}">Log this meal</button><button class="btn small" type="button" data-today="${di}:${uiEsc(m.slot)}">Add to Today</button>` : ''}
      </div>
    </div>`).join('')}
    <div class="totals" aria-label="Day totals versus plan">
      ${cmp.over.map(x => `<span class="nutrient-chip over">${uiEsc(uiNutrientLabel(x.nutrient))}: ${uiFmtNum(x.value, 1)} (over ${uiFmtNum(x.limit, 1)})</span>`).join('')}
      ${cmp.under.map(x => `<span class="nutrient-chip under">${uiEsc(uiNutrientLabel(x.nutrient))}: ${uiFmtNum(x.value, 1)} (under ${uiFmtNum(x.min, 1)})</span>`).join('')}
      ${cmp.ok.map(x => `<span class="nutrient-chip ok">${uiEsc(uiNutrientLabel(x.nutrient))}: ${uiFmtNum(x.value, 1)}</span>`).join('')}
      ${!cmp.over.length && !cmp.under.length && !cmp.ok.length ? `<span class="small muted">${uiFmtNum(d.totals.kcal)} kcal, ${uiFmtNum(d.totals.sodium_mg)} mg sodium. No numeric limits in the plan.</span>` : ''}
    </div>
  </section>`;
}

function weekSwapModal(di, slot, person, plan, week) {
  const day = week.days[di];
  const current = day.meals.find(m => m.slot === slot);
  const cooking = person.cooking || {};
  const dayIdx = new Date(day.date + 'T00:00:00').getDay();
  const others = emptyTotals();
  let dayTotals = others;
  for (const m of day.meals) {
    if (m.slot === slot || !m.recipe) continue;
    const r = uiState.recipesById.get(m.recipe);
    if (r) dayTotals = addTotals(dayTotals, recipeTotals(r, uiState.foodsById).perServing);
  }
  const recentIds = week.days.flatMap(d => d.meals.filter(m => m.recipe && !(d === day && m.slot === slot)).map(m => m.recipe));
  const candidates = uiState.data.recipes.filter(r => (!r.meal || !r.meal.length || r.meal.includes(slot)) && r.id !== (current && current.recipe));
  const scored = candidates.map(r => {
    const check = checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person);
    const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook: day.canCook, recentIds, dayTotals, plan, foodsById: uiState.foodsById });
    return { r, check, score: s.score, reasons: s.reasons };
  }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 5);
  const m = uiModal(`
    <p class="small muted">Top alternatives for ${WEEK_SLOT_LABEL[slot] || slot} on ${uiFmtDate(day.date)}, scored the same way the planner scores them. Recipes with a hard exclusion are not listed.</p>
    ${scored.length ? scored.map(x => `<div class="card tight">
      <div class="row between"><div><span class="dot ${x.check.verdict}" aria-hidden="true"></span><strong>${uiEsc(x.r.name)}</strong> <span class="badge ${x.check.verdict === 'caution' ? 'amber' : 'green'} outline">${uiVerdictWord(x.check.verdict)}</span></div><span class="small muted">score ${Math.round(x.score)}</span></div>
      <div class="small muted">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''}</div>
      ${x.reasons.length ? `<ul class="small">${x.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row"><button class="btn small primary" type="button" data-pick="${uiEsc(x.r.id)}">Use this</button><button class="btn small" type="button" data-detail="${uiEsc(x.r.id)}">Details</button></div>
    </div>`).join('') : '<p class="empty">No alternative fits this slot.</p>'}`, { title: 'Swap meal' });
  if (!m) return;
  m.el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    person.mealOverrides = person.mealOverrides || {};
    const key = uiWeekKey(person);
    person.mealOverrides[key] = person.mealOverrides[key] || {};
    person.mealOverrides[key][`${di}:${slot}`] = b.dataset.pick;
    // keep only the current week's overrides
    for (const k of Object.keys(person.mealOverrides)) if (k !== key) delete person.mealOverrides[k];
    uiPersist(); grocerySyncChanges(person, `Swapped ${WEEK_DAY_NAMES[day.day] || uiFmtDate(day.date)} ${slot}`); m.close(); uiToast('Meal swapped.'); uiState.rerender();
  }));
  m.el.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.detail, person, plan)));
}

export function weekRecipeModal(recipeId, person, plan) {
  const r = uiState.recipesById.get(recipeId);
  if (!r) return;
  const check = checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person);
  const per = check.perServing;
  const targetRows = Object.entries(plan.targets || {}).map(([n, t]) => ({ nutrient: n, perServing: round(per[n], 1), min: t.min, pct: t.min ? round(per[n] / t.min * 100) : null }));
  const swaps = ((r.notes && r.notes.swaps) || []).filter(s => plan.avoid && plan.avoid[s.if_tag]);
  uiModal(`
    <div class="verdict ${check.verdict}" style="padding:.6rem 1rem"><span class="verdict-word" style="font-size:1.2rem">${uiVerdictWord(check.verdict)}</span> <span class="small">${check.hits.length ? 'Matches: ' + check.hits.map(h => uiEsc(h.label) + (h.hard ? ' (hard)' : '')).join(', ') : 'No avoid tags matched.'}${check.exceeds.length ? ' One serving exceeds the daily ' + check.exceeds.map(e => uiEsc(uiNutrientLabel(e.nutrient))).join(', ') + '.' : ''}</span></div>
    <dl class="kv">
      <dt>Time</dt><dd>${r.active_min} min active, ${r.total_min} min total</dd>
      <dt>Skill</dt><dd>${uiEsc(r.skill)}</dd>
      <dt>Equipment</dt><dd>${(r.equipment || []).map(uiEsc).join(', ') || 'none'}</dd>
      <dt>Servings</dt><dd>${r.servings}${r.leftovers ? `, leftovers ${uiEsc(r.leftovers)}` : ''}</dd>
      ${r.meal ? `<dt>Meal</dt><dd>${r.meal.map(uiEsc).join(', ')}</dd>` : ''}
    </dl>
    ${swaps.length ? `<h3 style="margin-top:1rem">Swaps for your plan</h3>${swaps.map(s => `<div class="notice warn"><div class="notice-head">Caution</div><div><strong>${uiEsc(uiTagLabel(s.if_tag))}</strong> is on your avoid list. ${uiEsc(s.then)}</div></div>`).join('')}` : ''}
    <h3 style="margin-top:1rem">Ingredients</h3>
    <ul>${(r.ingredients || []).map(i => { const f = uiState.foodsById.get(i.food); return `<li>${uiEsc(i.display || (f ? f.short || f.name : i.food))} <span class="muted small">(${uiFmtNum(i.grams)} g${f ? '' : ', food not in database'})</span></li>`; }).join('')}</ul>
    ${check.unrecognized.length ? `<p class="small"><strong>Not recognized:</strong> ${check.unrecognized.map(uiEsc).join('; ')}. The app does not assume these are safe.</p>` : ''}
    <h3>Steps</h3>
    <ol>${(r.steps || []).map(s => `<li>${uiEsc(s)}</li>`).join('')}</ol>
    ${r.notes && r.notes.sodium_tip ? `<p class="small"><strong>Sodium:</strong> ${uiEsc(r.notes.sodium_tip)}</p>` : ''}
    <h3>Per serving versus your plan</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Nutrient</th><th class="num">Per serving</th><th class="num">Daily number</th><th class="num">% of daily</th></tr></thead>
      <tbody>
        ${check.vsLimits.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${v.missingData ? '<span class="muted">partial</span> ' : ''}${uiFmtNum(v.perServing, 1)}</td><td class="num">at most ${uiFmtNum(v.dailyLimit, 1)}</td><td class="num ${v.exceedsInOneServing ? 'over' : ''}">${v.pctOfDaily}%</td></tr>`).join('')}
        ${targetRows.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${uiFmtNum(v.perServing, 1)}</td><td class="num">at least ${uiFmtNum(v.min, 1)}</td><td class="num">${v.pct != null ? v.pct + '%' : ''}</td></tr>`).join('')}
        ${!check.vsLimits.length && !targetRows.length ? '<tr><td colspan="4" class="muted">No numeric limits or targets in the plan.</td></tr>' : ''}
      </tbody></table></div>
    <p class="small muted">${uiFmtNum(per.kcal)} kcal, ${uiFmtNum(per.protein_g, 1)} g protein, ${uiFmtNum(per.carb_g, 1)} g carbohydrate, ${uiFmtNum(per.fiber_g, 1)} g fiber, ${uiFmtNum(per.sodium_mg)} mg sodium per serving, summed from USDA values by grams.${check.missingFoods.length ? ' Some ingredients are not in the food database and are not counted.' : ''}</p>
    ${r.tags && r.tags.length ? `<p class="small muted">Tags: ${r.tags.map(t => `<code>${uiEsc(t)}</code>`).join(' ')}</p>` : ''}
  `, { title: r.name, label: 'Recipe: ' + r.name });
}
