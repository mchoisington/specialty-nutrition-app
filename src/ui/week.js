// Week: a 7-day plan from the planner, with swaps, logging, and recipe detail.
import { buildWeekPlan, scoreRecipe, recipeMeal, SLOT_LABEL, DAYS, snackPlan, isSnackSlot } from '../engine/planner.js';
import { recipeHeat, spicePreference } from '../engine/spice.js';
import { checkRecipe } from '../engine/checker.js';
import { compareToPlan, recipeTotals, emptyTotals, addTotals } from '../engine/nutrition.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiWeekKey, uiToday, uiIsoDate, uiFmtDate, uiFmtNum, uiNutrientLabel, uiModal, uiToast, uiVerdictWord, uiVerdictChip, uiPageHeader, uiSection, uiChip, uiIcon, uiNoticeHTML, uiEmptyState, uiSwitch, uiMeterTone } from './common.js';
import { grocerySyncChanges, grocerySetEaters } from './grocery.js';
import { todayAddDiaryEntry, todayTargetInfo } from './today.js';
import { recipesDetailModal, recipesTasteHTML, recipesBindTaste, recipesIsNever } from './recipes.js';

const WEEK_SLOT_LABEL = SLOT_LABEL;
const WEEK_MINUTE_OPTIONS = [10, 15, 20, 30, 45, 60, 90];
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
    if (recipesIsNever(person, recipe.id)) continue;
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

// Pins a recipe into one slot of the current week (a swap or "Put in this week"), then refreshes the grocery list with the reason.
export function weekSetOverride(person, di, slot, recipeId, reason) {
  grocerySyncChanges(person, 'Plan changed');   // make sure a snapshot of the list before this change exists, so the change is logged with its reason
  person.mealOverrides = person.mealOverrides || {};
  const key = uiWeekKey(person);
  person.mealOverrides[key] = person.mealOverrides[key] || {};
  person.mealOverrides[key][`${di}:${slot}`] = recipeId;
  for (const k of Object.keys(person.mealOverrides)) if (k !== key) delete person.mealOverrides[k];   // keep only the current week's overrides
  uiPersist();
  grocerySyncChanges(person, reason);
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
  const unknownOn = !!(person.cooking && person.cooking.include_unknown_nutrition);
  const snacks = week.snacks || snackPlan(person, plan);
  const snackAuto = snackPlan({ ...person, cooking: { ...(person.cooking || {}), snacks_per_day: undefined } }, plan);
  const spiceWord = { none: 'no heat', mild: 'mild only', medium: 'medium', hot: 'bring the heat' }[spicePreference(person)] || '';
  root.innerHTML = `
    ${uiPageHeader(`Week for ${uiEsc(person.name)}`, `Starting ${uiFmtDate(week.days[0].date)}. ${week.eligibleCount} of ${uiState.data.recipes.length} recipes are eligible${week.skippedNoNutrition ? `; ${uiFmtNum(week.skippedNoNutrition)} without nutrition data are left out` : ''}. Meals land on the days you can cook; leftovers and assembly meals fill the rest. Tap a day's cooking chip or minutes to change that day. Every meal was checked against the plan.`, `<button class="btn small" type="button" id="week-regen">${uiIcon('swap')}Regenerate</button><a class="btn small" href="#/recipes">${uiIcon('leaf')}Recipes</a>`)}
    <div class="card tight">${uiSwitch('week-budget', 'Save money', `Prefer recipes that reuse this week's ingredients. Household of ${household}.`, budget)}${uiSwitch('week-unknown', 'Recipes without nutrition data', 'Lets the planner use recipes whose ingredients are not linked to foods. The app cannot hold those to daily limits.', unknownOn)}
      <div class="switch" style="cursor:default"><div class="switch-text"><span class="switch-title">Snacks each day</span><span class="hint">${uiEsc(snacks.auto ? `Automatic: ${snacks.count}, from ${snacks.why}.` : `Set by you. ${snackAuto.count} would be automatic (${snackAuto.why}).${typeof (person.cooking || {}).snacks_per_day === 'number' && person.cooking.snacks_per_day > snacks.count ? ' The evening snack is left out for reflux.' : ''}`)}${spicePreference(person) !== 'any' ? ` Spice setting: ${uiEsc(spiceWord)}.` : ''}</span></div>
        <label class="visually-hidden" for="week-snacks">Snacks each day</label><select id="week-snacks" style="width:auto"><option value="auto" ${snacks.auto ? 'selected' : ''}>Automatic (${snackAuto.count})</option>${[0, 1, 2, 3].map(n => `<option value="${n}" ${!snacks.auto && (person.cooking || {}).snacks_per_day === n ? 'selected' : ''}>${n === 0 ? 'None' : n}</option>`).join('')}</select></div></div>
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
  root.querySelector('#week-snacks').addEventListener('change', e => {
    person.cooking = person.cooking || {};
    if (e.target.value === 'auto') delete person.cooking.snacks_per_day; else person.cooking.snacks_per_day = Number(e.target.value);
    weekInvalidate(person);
    uiPersist(); grocerySyncChanges(person, 'Changed snacks per day'); uiToast(e.target.value === 'auto' ? 'Snacks follow your plan again.' : `${e.target.value === '0' ? 'No snacks' : e.target.value + ' snack' + (e.target.value === '1' ? '' : 's')} each day.`); uiState.rerender();
  });
  root.querySelectorAll('[data-cook-toggle]').forEach(b => b.addEventListener('click', () => {
    const day = b.dataset.cookToggle;
    person.cooking = person.cooking || {};
    const c = person.cooking;
    const days = c.cook_days && c.cook_days.length ? c.cook_days.slice() : DAYS.slice();
    const on = days.includes(day);
    if (on && days.length === 1) { uiToast('Keep at least one cooking day, or the week has nothing to cook from.'); return; }
    c.cook_days = on ? days.filter(d => d !== day) : days.concat(day);
    weekInvalidate(person);
    uiPersist(); grocerySyncChanges(person, `${on ? 'No cooking' : 'Cooking'} on ${WEEK_DAY_NAMES[day]}`); uiToast(`${WEEK_DAY_NAMES[day]}: ${on ? 'no cooking. Leftovers and assembly meals will fill it.' : 'cooking is on.'}`); uiState.rerender();
  }));
  root.querySelectorAll('[data-minutes]').forEach(sel => sel.addEventListener('change', () => {
    const day = sel.dataset.minutes;
    person.cooking = person.cooking || {};
    person.cooking.day_minutes = person.cooking.day_minutes || {};
    person.cooking.day_minutes[day] = Number(sel.value);
    weekInvalidate(person);
    uiPersist(); grocerySyncChanges(person, `${sel.value} minutes on ${WEEK_DAY_NAMES[day]}`); uiToast(`${WEEK_DAY_NAMES[day]}: ${sel.value} minutes to cook. This sticks for every ${WEEK_DAY_NAMES[day]}.`); uiState.rerender();
  }));
  root.querySelector('#week-unknown').addEventListener('change', e => {
    person.cooking = person.cooking || {};
    person.cooking.include_unknown_nutrition = e.target.checked;
    uiPersist(); grocerySyncChanges(person, e.target.checked ? 'Allowed recipes without nutrition data' : 'Excluded recipes without nutrition data'); uiToast(e.target.checked ? 'Recipes without nutrition data can now be scheduled. Daily limits cannot be checked for them.' : 'Only recipes with known nutrition are scheduled.'); uiState.rerender();
  });
  root.querySelectorAll('[data-eaters]').forEach(inp => inp.addEventListener('change', () => {
    const reason = grocerySetEaters(person, inp.dataset.eaters, inp.value, inp.dataset.day);
    if (reason) uiToast(reason + '. The week and grocery list were updated.');
    uiState.rerender();
  }));
  recipesBindTaste(root, person, (kind) => { if (kind === 'never') grocerySyncChanges(person, 'Marked a recipe never again'); uiState.rerender(); });
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

// Drops the cached week for this person so the next render rebuilds it with the new cooking settings. Swaps are kept.
function weekInvalidate(person) { uiState.weekCache.delete(uiWeekKey(person)); }

// " · medium heat" for a meal with any heat, so a spice-sensitive eater sees it at a glance.
function weekHeatWord(recipeId) {
  const r = recipeId ? uiState.recipesById.get(recipeId) : null;
  if (!r) return '';
  const h = recipeHeat(r);
  return h.level ? ` · ${h.label.toLowerCase()}` : '';
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
      <div class="week-day-meta">${uiChip(d.canCook ? 'can cook' : 'no cooking', d.canCook ? 'pass' : 'neutral', { button: true, attrs: `data-cook-toggle="${uiEsc(d.day)}" aria-pressed="${d.canCook}" title="Tap to switch cooking ${d.canCook ? 'off' : 'on'} for every ${WEEK_DAY_NAMES[d.day]}"` })}
        <label class="week-minutes"><span class="visually-hidden">Minutes to cook on ${WEEK_DAY_NAMES[d.day]}</span><select data-minutes="${uiEsc(d.day)}" title="Minutes you have to cook on ${WEEK_DAY_NAMES[d.day]}">${(WEEK_MINUTE_OPTIONS.includes(d.minutes) ? WEEK_MINUTE_OPTIONS : WEEK_MINUTE_OPTIONS.concat(d.minutes).sort((a, b) => a - b)).map(m => `<option value="${m}" ${m === d.minutes ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
        <label class="week-eaters">${uiIcon('people')}<input type="number" inputmode="numeric" min="1" max="20" value="${d.eaters}" data-eaters="${uiEsc(d.date)}" data-day="${uiEsc(d.day)}" aria-label="Eaters on ${uiEsc(uiFmtDate(d.date))}"></label></div>
    </div>
    ${d.meals.map(m => {
      return `<div class="week-meal">
      <div class="slot">${WEEK_SLOT_LABEL[m.slot] || m.slot}</div>
      ${m.recipe ? `<button type="button" class="meal-chip" data-recipe="${uiEsc(m.recipe)}" aria-label="${uiEsc(m.name)}, ${uiVerdictWord(m.check.verdict)}. Open recipe."><span class="dot ${m.check.verdict}" aria-hidden="true"></span><span class="meal-chip-text"><span class="meal-chip-name">${uiEsc(m.name)}</span><span class="meal-chip-sub">${weekSourceGlyph(m.source)}<span>${uiVerdictWord(m.check.verdict)}${m.servingsMade && m.servingsMade > m.servings ? ` · make ${m.servingsMade}` : ''}${m.swapped ? ' · swapped' : ''}${weekHeatWord(m.recipe)}</span></span></span></button>
        ${m.check.hits && m.check.hits.length ? `<div class="meal-note">Caution: ${m.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}
        ${m.check.exceeds && m.check.exceeds.length ? `<div class="meal-note">One serving exceeds the daily ${m.check.exceeds.map(uiNutrientLabel).map(uiEsc).join(', ')}.</div>` : ''}
        <div class="meal-acts">
          <button class="btn small icon" type="button" data-swap="${di}" data-slot="${uiEsc(m.slot)}" aria-label="Swap ${WEEK_SLOT_LABEL[m.slot] || m.slot} on ${uiEsc(uiFmtDate(d.date))}" title="Swap">${uiIcon('swap')}</button>
          <button class="btn small icon" type="button" data-log="${di}:${uiEsc(m.slot)}" aria-label="Log ${uiEsc(m.name)} in the symptom log" title="Log this meal">${uiIcon('note')}</button>
          <button class="btn small icon" type="button" data-today="${di}:${uiEsc(m.slot)}" aria-label="Add ${uiEsc(m.name)} to Today" title="Add to Today">${uiIcon('plus')}</button>
          ${recipesTasteHTML(person, m.recipe)}
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
  const candidates = uiState.data.recipes.filter(r => recipeMeal(r, slot) && r.id !== (current && current.recipe));
  const favorites = (person.favorites && person.favorites.recipes) || [];
  const disliked = (person.disliked && person.disliked.recipes) || [];
  const scored = candidates.map(r => {
    const check = checkRecipe(r, plan, uiState.matcher, uiState.foodsById, person);
    const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook: day.canCook, recentIds, dayTotals, plan, foodsById: uiState.foodsById, favorites, disliked, person, slot });
    return { r, check, score: s.score, reasons: s.reasons };
  }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score).slice(0, 5);
  const m = uiModal(`
    <p class="small muted">Top alternatives for ${WEEK_SLOT_LABEL[slot] || slot} on ${uiFmtDate(day.date)}, scored the same way the planner scores them. Recipes with a hard exclusion are not listed.</p>
    ${scored.length ? `<div class="list">${scored.map(x => `<div class="list-row"><div class="list-main">
      <div class="list-title"><span class="dot ${x.check.verdict}" aria-hidden="true"></span>${uiEsc(x.r.name)} ${uiVerdictChip(x.check.verdict)}</div>
      <div class="list-sub">${x.r.active_min} min active, ${x.r.total_min} total, ${uiEsc(x.r.skill)}${x.r.assembly_only ? ', assembly only' : ''} · score ${Math.round(x.score)}</div>
      ${x.reasons.length ? `<ul class="small">${x.reasons.map(r => `<li>${uiEsc(r)}</li>`).join('')}</ul>` : ''}
      <div class="btn-row" style="margin-top:8px"><button class="btn small primary" type="button" data-pick="${uiEsc(x.r.id)}">Use this</button><button class="btn small" type="button" data-detail="${uiEsc(x.r.id)}">Details</button>${recipesTasteHTML(person, x.r.id)}</div>
    </div></div>`).join('')}</div>` : uiEmptyState('No alternative fits this slot.')}`, { title: 'Swap meal' });
  if (!m) return;
  m.el.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
    weekSetOverride(person, di, slot, b.dataset.pick, `Swapped ${WEEK_DAY_NAMES[day.day] || uiFmtDate(day.date)} ${slot}`);
    m.close(); uiToast('Meal swapped.'); uiState.rerender();
  }));
  m.el.querySelectorAll('[data-detail]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.detail, person, plan)));
  recipesBindTaste(m.el, person, (kind, id, on) => {
    if (kind === 'never' && on) { const row = m.el.querySelector(`[data-never="${CSS.escape(id)}"]`); const li = row && row.closest('.list-row'); if (li) li.remove(); }
  });
}

// The recipe detail sheet lives in recipes.js; Week, Pantry, and Together open it through this name.
export function weekRecipeModal(recipeId, person, plan, opts) {
  return recipesDetailModal(recipeId, person, plan, opts);
}
