// Week: a 7-day plan from the planner, with swaps, logging, and recipe detail.
import { buildWeekPlan, scoreRecipe } from '../engine/planner.js';
import { checkRecipe } from '../engine/checker.js';
import { compareToPlan, recipeTotals, emptyTotals, addTotals, round } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiWeekKey, uiToday, uiIsoDate, uiFmtDate, uiFmtNum, uiNutrientLabel, uiModal, uiToast, uiVerdictWord, uiVerdictChip, uiTagLabel, uiPageHeader, uiSection, uiChip, uiIcon, uiNoticeHTML, uiEmptyState, uiSwitch, uiMeterTone } from './common.js';
import { grocerySyncChanges, grocerySetEaters } from './grocery.js';
import { todayAddDiaryEntry, todayIsFavorite, todayToggleFavorite, todayTargetInfo } from './today.js';

const WEEK_SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };
const WEEK_DAY_NAMES = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
const WEEK_DAY_SHORT = { sun: 'Sun', mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' };

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
    root.innerHTML = `${uiPageHeader('Week')}${uiEmptyState('No recipes are loaded (data/recipes.json is missing or empty), so a week cannot be built.')}`;
    return;
  }
  const week = weekGet(person, plan);
  const budget = !!(person.cooking && person.cooking.budget);
  const household = Math.max(1, Number((person.cooking || {}).household) || 1);
  root.innerHTML = `
    ${uiPageHeader(`Week for ${uiEsc(person.name)}`, `Starting ${uiFmtDate(week.days[0].date)}. ${week.eligibleCount} of ${uiState.data.recipes.length} recipes are eligible. Meals land on the days you can cook; leftovers and assembly meals fill the rest. Every meal was checked against the plan.`, `<button class="btn small" type="button" id="week-regen">${uiIcon('swap')}Regenerate</button>`)}
    <div class="card tight">${uiSwitch('week-budget', 'Save money', `Prefer recipes that reuse this week's ingredients. Household of ${household}.`, budget)}</div>
    ${week.unmet.length ? uiNoticeHTML({ level: 'warn', text: `${week.unmet.length} slot${week.unmet.length === 1 ? '' : 's'} could not be filled: ${week.unmet.map(u => `${uiFmtDate(u.date)} ${u.slot}`).join(', ')}. No recipe fit the plan for that slot.` }) : ''}
    <div class="week-grid">${week.days.map((d, di) => weekDayHTML(d, di, plan, person)).join('')}</div>
    ${uiSection('Week at a glance', weekGlanceHTML(week, plan, person), { id: 'week-glance-h' })}
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

// "Sodium (mg)" -> "Sodium mg"; whole numbers for milligram nutrients.
function weekShortLabel(n) { return uiNutrientLabel(n).replace(/\s*\((.*)\)\s*$/, ' $1').replace('% of calories', '%'); }
function weekDigits(n) { return /_mg$|^kcal$/.test(n) ? 0 : 1; }

// Source glyph for a meal: cook (flame), leftovers (clock), assembly (bowl).
function weekSourceGlyph(source) {
  if (source === 'leftover') return uiIcon('clock', { cls: 'src', label: 'Leftovers' });
  if (source === 'assembly') return uiIcon('bowl', { cls: 'src', label: 'Assembly, no cooking' });
  return uiIcon('flame', { cls: 'src', label: 'Cook' });
}

function weekDayHTML(d, di, plan, person) {
  const cmp = compareToPlan(d.totals, plan);
  const isToday = d.date === uiIsoDate(uiToday());
  const [, mo, da] = d.date.split('-');
  return `<section class="week-day ${isToday ? 'today' : ''}" aria-labelledby="day-${di}">
    <div class="week-day-head">
      <div class="week-day-name"><span id="day-${di}">${WEEK_DAY_NAMES[d.day] || uiFmtDate(d.date)}</span><span class="week-day-date">${Number(mo)}/${Number(da)}${isToday ? ' · today' : ''}</span></div>
      <div class="week-day-meta">${d.canCook ? uiChip('can cook', 'pass') : uiChip('no cooking', 'neutral')}<span>${d.minutes} min</span>
        <label class="week-eaters">${uiIcon('people')}<input type="number" inputmode="numeric" min="1" max="20" value="${d.eaters}" data-eaters="${uiEsc(d.date)}" data-day="${uiEsc(d.day)}" aria-label="Eaters on ${uiEsc(uiFmtDate(d.date))}"></label></div>
    </div>
    ${d.meals.map(m => {
      const fav = m.recipe && person ? todayIsFavorite(person, 'recipe', m.recipe) : false;
      return `<div class="week-meal">
      <div class="slot">${WEEK_SLOT_LABEL[m.slot] || m.slot}</div>
      ${m.recipe ? `<button type="button" class="meal-chip" data-recipe="${uiEsc(m.recipe)}" aria-label="${uiEsc(m.name)}, ${uiVerdictWord(m.check.verdict)}. Open recipe."><span class="dot ${m.check.verdict}" aria-hidden="true"></span><span class="meal-chip-text"><span class="meal-chip-name">${uiEsc(m.name)}</span><span class="meal-chip-sub">${weekSourceGlyph(m.source)}<span>${uiVerdictWord(m.check.verdict)}${m.servingsMade && m.servingsMade > m.servings ? ` · make ${m.servingsMade}` : ''}${m.swapped ? ' · swapped' : ''}</span></span></span></button>
        ${m.check.hits && m.check.hits.length ? `<div class="meal-note">Caution: ${m.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}
        ${m.check.exceeds && m.check.exceeds.length ? `<div class="meal-note">One serving exceeds the daily ${m.check.exceeds.map(uiNutrientLabel).map(uiEsc).join(', ')}.</div>` : ''}
        <div class="meal-acts">
          <button class="btn small icon" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}" aria-label="Swap ${WEEK_SLOT_LABEL[m.slot] || m.slot} on ${uiEsc(uiFmtDate(d.date))}" title="Swap">${uiIcon('swap')}</button>
          <button class="btn small icon" type="button" data-log="${di}:${uiEsc(m.slot)}" aria-label="Log ${uiEsc(m.name)} in the symptom log" title="Log this meal">${uiIcon('note')}</button>
          <button class="btn small icon" type="button" data-today="${di}:${uiEsc(m.slot)}" aria-label="Add ${uiEsc(m.name)} to Today" title="Add to Today">${uiIcon('plus')}</button>
          ${person ? `<button class="heart-btn ${fav ? 'on' : ''}" type="button" data-fav="${uiEsc(m.recipe)}" aria-pressed="${fav}" aria-label="${fav ? 'Remove from favorites' : 'Add to favorites'}">${uiIcon('heart', { fill: fav })}</button>` : ''}
        </div>
        ${m.reasons && m.reasons.length || m.source === 'leftover' ? `<details><summary>Why this</summary><ul class="small">${m.source === 'leftover' ? '<li>Leftovers from a meal made earlier this week.</li>' : ''}${(m.reasons || []).map(r => `<li>${uiEsc(r)}</li>`).join('')}${m.reasons && !m.reasons.length && m.source !== 'leftover' ? '<li>Fits the plan, your time, skill, and equipment with no penalties.</li>' : ''}${m.score != null ? `<li class="muted">Score ${m.score}</li>` : ''}</ul></details>` : ''}`
      : `<div class="muted small">No recipe fit this slot.</div><div class="meal-acts"><button class="btn small icon" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}" aria-label="Pick a meal for ${WEEK_SLOT_LABEL[m.slot] || m.slot}" title="Pick a meal">${uiIcon('swap')}</button></div>`}
    </div>`; }).join('')}
    <div class="week-totals" aria-label="Day totals versus plan">
      ${cmp.over.map(x => `<span class="nutrient-chip over">${uiEsc(weekShortLabel(x.nutrient))} ${uiFmtNum(x.value, weekDigits(x.nutrient))}, over ${uiFmtNum(x.limit, weekDigits(x.nutrient))}</span>`).join('')}
      ${cmp.under.map(x => `<span class="nutrient-chip under">${uiEsc(weekShortLabel(x.nutrient))} ${uiFmtNum(x.value, weekDigits(x.nutrient))}, under ${uiFmtNum(x.min, weekDigits(x.nutrient))}</span>`).join('')}
      ${cmp.ok.map(x => `<span class="nutrient-chip ok">${uiEsc(weekShortLabel(x.nutrient))} ${uiFmtNum(x.value, weekDigits(x.nutrient))}, ok</span>`).join('')}
      ${!cmp.over.length && !cmp.under.length && !cmp.ok.length ? `<span class="muted">${uiFmtNum(d.totals.kcal)} kcal, ${uiFmtNum(d.totals.sodium_mg)} mg sodium. No numeric limits in the plan.</span>` : ''}
    </div>
  </section>`;
}

// One small bar per day: planned kcal against the calorie target when one exists, otherwise sodium against its limit.
function weekGlanceHTML(week, plan, person) {
  const info = todayTargetInfo(person, plan);
  const useKcal = info.state === 'ok' && info.kcal > 0;
  const limit = useKcal ? info.kcal : plan.limits.sodium_mg ? plan.limits.sodium_mg.value : null;
  const key = useKcal ? 'kcal' : 'sodium_mg';
  const label = useKcal ? 'kcal' : 'mg sodium';
  const max = Math.max(limit || 0, ...week.days.map(d => d.totals[key] || 0)) || 1;
  return `<div class="week-glance" role="img" aria-label="Planned ${label} per day${limit ? ` against ${uiFmtNum(limit)}` : ''}">
    ${week.days.map(d => {
      const v = d.totals[key] || 0;
      const t = limit ? uiMeterTone(v, limit, useKcal ? 'kcal' : 'limit') : { tone: 'neutral', word: '' };
      return `<div class="glance-day"><div class="glance-col ${t.tone}" title="${uiEsc(uiFmtDate(d.date))}: ${uiFmtNum(v)} ${label}${limit ? `, ${t.word}` : ''}">${limit ? `<span class="glance-limit" style="bottom:${(limit / max * 100).toFixed(1)}%"></span>` : ''}<span style="height:${(v / max * 100).toFixed(1)}%"></span></div><div class="glance-label">${WEEK_DAY_SHORT[d.day] || ''}</div><div class="glance-value">${uiFmtNum(v)}</div></div>`;
    }).join('')}
  </div>
  <p class="small muted">Planned ${label} per day from the recipes above${limit ? `; the dashed line is ${useKcal ? 'the estimated calorie target' : 'the sodium limit'} of ${uiFmtNum(limit)}` : '; no calorie target or sodium limit is active'}. Days over the line are marked "over" in the day's totals.</p>`;
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
    ${scored.length ? `<div class="list">${scored.map(x => `<div class="list-row"><div class="list-main">
      <div class="list-title"><span class="dot ${x.check.verdict}" aria-hidden="true"></span>${uiEsc(x.r.name)} ${uiVerdictChip(x.check.verdict)}</div>
      <div class="list-sub">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''} · score ${Math.round(x.score)}</div>
      ${x.reasons.length ? `<ul class="small">${x.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn small primary" type="button" data-pick="${uiEsc(x.r.id)}">Use this</button><button class="btn small" type="button" data-detail="${uiEsc(x.r.id)}">Details</button></div>
    </div></div>`).join('')}</div>` : uiEmptyState('No alternative fits this slot.')}`, { title: 'Swap meal' });
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
    <div class="verdict compact ${check.verdict}"><span class="verdict-word">${uiVerdictWord(check.verdict)}</span> <span class="small">${check.hits.length ? 'Matches: ' + check.hits.map(h => uiEsc(h.label) + (h.hard ? ' (hard)' : '')).join(', ') : 'No avoid tags matched.'}${check.exceeds.length ? ' One serving exceeds the daily ' + check.exceeds.map(e => uiEsc(uiNutrientLabel(e.nutrient))).join(', ') + '.' : ''}</span></div>
    <dl class="kv">
      <dt>Time</dt><dd>${r.active_min} min active, ${r.total_min} min total</dd>
      <dt>Skill</dt><dd>${uiEsc(r.skill)}</dd>
      <dt>Equipment</dt><dd>${(r.equipment || []).map(uiEsc).join(', ') || 'none'}</dd>
      <dt>Servings</dt><dd>${r.servings}${r.leftovers ? `, leftovers ${uiEsc(r.leftovers)}` : ''}</dd>
      ${r.meal ? `<dt>Meal</dt><dd>${r.meal.map(uiEsc).join(', ')}</dd>` : ''}
    </dl>
    ${swaps.length ? `<div class="stack">${swaps.map(s => uiNoticeHTML({ level: 'warn', text: `${uiTagLabel(s.if_tag)} is on your avoid list. ${s.then}` })).join('')}</div>` : ''}
    <div class="recipe-cols">
      <div><h3>Ingredients</h3>
        <ul>${(r.ingredients || []).map(i => { const f = uiState.foodsById.get(i.food); return `<li>${uiEsc(i.display || (f ? f.short || f.name : i.food))} <span class="muted small num">(${uiFmtNum(i.grams)} g${f ? '' : ', food not in database'})</span></li>`; }).join('')}</ul>
        ${check.unrecognized.length ? `<p class="small"><strong>Not recognized:</strong> ${check.unrecognized.map(uiEsc).join('; ')}. The app does not assume these are safe.</p>` : ''}</div>
      <div><h3>Steps</h3>
        <ol>${(r.steps || []).map(s => `<li>${uiEsc(s)}</li>`).join('')}</ol>
        ${r.notes && r.notes.sodium_tip ? `<p class="small"><strong>Sodium:</strong> ${uiEsc(r.notes.sodium_tip)}</p>` : ''}</div>
    </div>
    <h3>Per serving versus your plan</h3>
    <div class="table-wrap"><table>
      <thead><tr><th>Nutrient</th><th class="num">Per serving</th><th class="num">Daily number</th><th class="num">% of daily</th></tr></thead>
      <tbody>
        ${check.vsLimits.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${v.missingData ? '<span class="muted">partial</span> ' : ''}${uiFmtNum(v.perServing, 1)}</td><td class="num">at most ${uiFmtNum(v.dailyLimit, 1)}</td><td class="num ${v.exceedsInOneServing ? 'over' : ''}">${v.pctOfDaily}%${v.exceedsInOneServing ? ' over' : ''}</td></tr>`).join('')}
        ${targetRows.map(v => `<tr><td>${uiEsc(uiNutrientLabel(v.nutrient))}</td><td class="num">${uiFmtNum(v.perServing, 1)}</td><td class="num">at least ${uiFmtNum(v.min, 1)}</td><td class="num">${v.pct != null ? v.pct + '%' : ''}</td></tr>`).join('')}
        ${!check.vsLimits.length && !targetRows.length ? '<tr><td colspan="4" class="muted">No numeric limits or targets in the plan.</td></tr>' : ''}
      </tbody></table></div>
    <p class="small muted">${uiFmtNum(per.kcal)} kcal, ${uiFmtNum(per.protein_g, 1)} g protein, ${uiFmtNum(per.carb_g, 1)} g carbohydrate, ${uiFmtNum(per.fiber_g, 1)} g fiber, ${uiFmtNum(per.sodium_mg)} mg sodium per serving, summed from USDA values by grams.${check.missingFoods.length ? ' Some ingredients are not in the food database and are not counted.' : ''}</p>
    ${r.tags && r.tags.length ? `<p class="small muted">Tags: ${r.tags.map(t => `<code>${uiEsc(t)}</code>`).join(' ')}</p>` : ''}
  `, { title: r.name, label: 'Recipe: ' + r.name });
}
