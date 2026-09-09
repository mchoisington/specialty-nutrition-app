// Weekly meal plan. Deterministic given a seed. Hard exclusions are never scheduled.
// Scoring blends: hard/soft avoid, prefer tags, time fit, skill and equipment fit, leftovers tolerance, variety, spice, cuisine, and daily nutrient limits.
import { checkRecipe } from './checker.js';
import { emptyTotals, addTotals, scaleTotals, recipeTotals, derived } from './nutrition.js';
import { cuisineSkipped, cuisineLoved } from './cuisine.js';
import { spiceSkipped, spiceBonus } from './spice.js';

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SKILL = { beginner: 0, comfortable: 1, confident: 2 };

// Snack slots, in the order they fall in a day. A snack slot draws from recipes tagged "snack".
export const SNACK_SLOTS = [
  { id: 'snack-am', label: 'Morning snack' },
  { id: 'snack-pm', label: 'Afternoon snack' },
  { id: 'snack-eve', label: 'Evening snack' }
];
export const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'snack-am': 'Morning snack', 'snack-pm': 'Afternoon snack', 'snack-eve': 'Evening snack' };
export function isSnackSlot(slot) { return typeof slot === 'string' && slot.startsWith('snack'); }

// Conditions where smaller, more frequent eating is part of the plan (each cites its rule in conditions.json):
// gestational diabetes (three meals and two to three snacks, gdm-carb), reflux (gerd-small-meals), gastroparesis
// (gp-small-meals, 4 to 6 a day), GLP-1 users (wm-glp1-meals), cancer treatment nausea (ca-tx-symptoms).
const FREQUENT_MODULES = { 'pregnancy-gdm-breastfeeding': 'gdm', gerd: 'gerd', gastroparesis: 'frequent', 'weight-management-glp1': 'frequent', 'cancer-nutrition': 'frequent' };

// How many snacks a day the plan should carry and why. The person's own setting wins; otherwise the conditions decide.
export function snackPlan(person, plan) {
  const set = person && person.cooking && person.cooking.snacks_per_day;
  const mods = new Set(((plan && plan.modules) || []).map(m => m.id));
  let kind = null;
  for (const [id, k] of Object.entries(FREQUENT_MODULES)) if (mods.has(id)) { kind = kind === 'gdm' ? kind : k; }
  let count, why;
  if (typeof set === 'number' && set >= 0 && set <= 3) { count = set; why = 'your setting'; }
  else if (kind === 'gdm') { count = 2; why = 'gestational diabetes guidance: three meals and two to three snacks, including one before bed'; }
  else if (kind === 'gerd') { count = 2; why = 'reflux guidance: smaller meals, and nothing close to lying down'; }
  else if (kind === 'frequent') { count = 2; why = 'your plan calls for smaller, more frequent meals'; }
  else if (person && person.adult === false) { count = 2; why = 'children do well with regular snacks between meals'; }
  else { count = 1; why = 'one afternoon snack by default'; }
  let slots;
  if (count === 0) slots = [];
  else if (count === 1) slots = ['snack-pm'];
  else if (count === 2) slots = kind === 'gdm' ? ['snack-pm', 'snack-eve'] : ['snack-am', 'snack-pm'];
  else slots = ['snack-am', 'snack-pm', 'snack-eve'];
  if (kind === 'gerd') slots = slots.filter(s => s !== 'snack-eve');   // no evening snack with reflux
  return { count: slots.length, slots, why, auto: why !== 'your setting' };
}

// The day's slots in order: breakfast, morning snack, lunch, afternoon snack, dinner, evening snack.
export function daySlots(person, plan) {
  const snacks = new Set(snackPlan(person, plan).slots);
  const order = ['breakfast', 'snack-am', 'lunch', 'snack-pm', 'dinner', 'snack-eve'];
  return order.filter(s => !isSnackSlot(s) || snacks.has(s));
}

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// Minutes the person can cook on a given weekday. A per-day override (set from the Week screen) wins over the weekday/weekend answer.
export function minutesAvailable(cooking, dayIdx) {
  const day = DAYS[dayIdx];
  const per = cooking && cooking.day_minutes;
  if (per && typeof per[day] === 'number' && per[day] > 0) return per[day];
  const weekend = dayIdx === 0 || dayIdx === 6;
  const m = weekend ? cooking.weekend_minutes : cooking.weekday_minutes;
  return Number(m) || 20;
}

// Whether the person can cook on a given weekday. An empty cook_days list means every day.
export function canCookOn(cooking, dayIdx) {
  const days = cooking && cooking.cook_days;
  if (!days || !days.length) return true;
  return days.includes(DAYS[dayIdx]);
}

export function scoreRecipe({ recipe, check, cooking, dayIdx, canCook, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person, slot }) {
  if (check.verdict === 'fail') return { score: -Infinity, reasons: ['hard exclusion'] };
  if (disliked && disliked.includes(recipe.id)) return { score: -Infinity, reasons: ['marked never again'] };
  if (person && cuisineSkipped(recipe, person)) return { score: -Infinity, reasons: ['cuisine skipped'] };
  if (person && spiceSkipped(recipe, person)) return { score: -Infinity, reasons: ['too spicy for your setting'] };
  const reasons = [];
  let score = 100;
  // taste: the only signal that matters for a family. Favorites get a solid bonus.
  if (favorites && favorites.includes(recipe.id)) { score += 35; reasons.push('a favorite'); }
  if (person && cuisineLoved(recipe, person)) { score += 12; reasons.push('a cuisine you love'); }
  if (person) { const sb = spiceBonus(recipe, person); if (sb.bonus) { score += sb.bonus; reasons.push(sb.reason); } }
  // soft avoid
  for (const h of check.hits) { score -= 25; reasons.push(`contains ${h.label} (avoid)`); }
  for (const t of check.termHits || []) { score -= 15; reasons.push(`contains "${t.term}" (your preference)`); }
  if (check.unknownRisk.length) { score -= 5; }
  // prefer
  score += Math.min(30, check.preferHits.length * 6);
  // time. Snacks are held to a short assembly window whatever the day allows.
  const snack = isSnackSlot(slot);
  const avail = snack ? Math.min(15, minutesAvailable(cooking, dayIdx)) : minutesAvailable(cooking, dayIdx);
  if (!canCook && !snack) {
    if (!recipe.assembly_only && (recipe.active_min || 0) > 10) { score -= 60; reasons.push('no time to cook that day'); }
  } else if ((recipe.active_min || 0) > avail) { score -= 40 + ((recipe.active_min - avail) * 1.5); reasons.push(`needs ${recipe.active_min} active minutes, you have ${avail}`); }
  // interest
  if (cooking.interest === 'assembly' && !recipe.assembly_only) { score -= 50; reasons.push('you asked for assembly-only meals'); }
  if (cooking.interest === 'minimal' && (recipe.active_min || 0) > 15) { score -= 20; }
  // skill
  const need = SKILL[recipe.skill] ?? 1, have = SKILL[cooking.skill] ?? 1;
  if (need > have) { score -= 30 * (need - have); reasons.push(`skill level ${recipe.skill}`); }
  // equipment
  const eq = new Set(cooking.equipment || []);
  for (const e of recipe.equipment || []) if (e !== 'none' && !eq.has(e)) { score -= 45; reasons.push(`needs ${e}`); }
  // budget: reward recipes that reuse ingredients already on this week's list (fewer distinct items to buy)
  if (cooking.budget && weekFoods && weekFoods.size) {
    const ings = (recipe.ingredients || []).map(i => i.food);
    const shared = ings.filter(f => weekFoods.has(f)).length;
    const bonus = Math.min(20, Math.round((shared / Math.max(1, ings.length)) * 25));
    score += bonus;
    if (shared) reasons.push(`reuses ${shared} ingredient${shared === 1 ? '' : 's'} already on the list`);
  }
  // variety
  const seen = recentIds.filter(id => id === recipe.id).length;
  const tol = cooking.leftovers === 'good' ? 6 : cooking.leftovers === 'poor' ? 40 : 18;
  score -= seen * tol;
  // daily nutrient limits: project the day's total with this recipe added
  if (plan && dayTotals) {
    const per = recipeTotals(recipe, foodsById).perServing;
    const projected = addTotals(dayTotals, per);
    const d = derived(projected);
    for (const [nut, lim] of Object.entries(plan.limits || {})) {
      const v = nut in d ? d[nut] : projected[nut];
      if (v == null) continue;
      if (v > lim.value) { score -= 35; reasons.push(`would push the day over the ${nut.replace(/_/g, ' ')} limit`); }
    }
  }
  return { score, reasons };
}

// A component (sauce, dressing, stock, dough, spice mix) is never a meal on its own.
export function isComponent(r) { return Array.isArray(r.meal) && r.meal.length === 1 && r.meal[0] === 'component'; }

export function buildWeekPlan({ person, plan, recipes, foodsById, matcher, startDate = new Date(), seed = 0, slots }) {
  const cooking = person.cooking || {};
  const favorites = (person.favorites && person.favorites.recipes) || [];
  const disliked = (person.disliked && person.disliked.recipes) || [];
  const rnd = mulberry32(hashStr(person.id + '|' + startDate.toISOString().slice(0, 10) + '|' + seed));
  const daySlotList = slots || daySlots(person, plan);
  // Only recipes with known nutrition can be held to daily limits. Recipes without it (community imports whose
  // ingredients are not yet linked to foods) are scheduled only when the person has favorited them, and are flagged.
  const hasNutrition = r => !!(r.nutrition_per_serving && r.nutrition_source) || (r.ingredients || []).some(i => i.food);
  const meals = recipes.filter(r => !isComponent(r));
  const pool = meals.filter(r => (hasNutrition(r) || favorites.includes(r.id) || cooking.include_unknown_nutrition) && !cuisineSkipped(r, person) && !spiceSkipped(r, person));
  const checks = new Map(pool.map(r => [r.id, checkRecipe(r, plan, matcher, foodsById, person)]));
  const eligible = pool.filter(r => checks.get(r.id).verdict !== 'fail' && !disliked.includes(r.id));
  const excluded = pool.filter(r => checks.get(r.id).verdict === 'fail').map(r => ({ id: r.id, name: r.name, why: checks.get(r.id).hits.filter(h => h.hard).map(h => h.label) }));
  const skippedNoNutrition = meals.length - pool.length;
  const days = [];
  const recentIds = [];
  const leftovers = []; // {recipeId, servings, madeOn}
  const household = Math.max(1, Number(cooking.household) || 1);
  const perDay = person.servings_by_day || {}; // { 'sun': 4 } overrides for guests
  const unmet = [];
  const weekFoods = new Set();

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const dayIdx = date.getDay();
    const canCook = canCookOn(cooking, dayIdx);
    const dateKey = date.toISOString().slice(0, 10);
    const eaters = Math.max(1, Number(perDay[dateKey] || perDay[DAYS[dayIdx]] || household));
    let dayTotals = emptyTotals();
    const dayMeals = [];
    for (const slot of daySlotList) {
      const snack = isSnackSlot(slot);
      // use leftovers first on no-cook days, or when leftovers tolerance is good (never as a snack)
      const lo = snack ? null : leftovers.find(l => l.servings >= eaters && (i - l.madeOn) <= 3 && recipeMeal(l.recipe, slot));
      if (lo && (!canCook || cooking.leftovers === 'good' && rnd() < 0.5)) {
        lo.servings -= eaters;
        const per = recipeTotals(lo.recipe, foodsById).perServing;
        dayTotals = addTotals(dayTotals, per);
        dayMeals.push({ slot, recipe: lo.recipe.id, name: lo.recipe.name, source: 'leftover', servings: eaters, check: summarize(checks.get(lo.recipe.id)) });
        recentIds.push(lo.recipe.id);
        continue;
      }
      const candidates = eligible.filter(r => recipeMeal(r, slot));
      const scored = candidates.map(r => {
        const check = checks.get(r.id);
        const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook, recentIds, dayTotals, plan, foodsById, weekFoods, favorites, disliked, person, slot });
        return { r, check, score: s.score + rnd() * 4, reasons: s.reasons };
      }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score);
      if (!scored.length) { unmet.push({ date: dateKey, slot, why: 'no recipe fits' }); dayMeals.push({ slot, recipe: null, source: 'none' }); continue; }
      const pick = scored[0];
      const per = recipeTotals(pick.r, foodsById).perServing;
      dayTotals = addTotals(dayTotals, per);
      const batch = !snack && canCook && (cooking.leftovers !== 'poor') && (pick.r.leftovers === 'good' || pick.r.leftovers === 'ok');
      const servingsMade = batch ? Math.max(pick.r.servings || eaters, eaters * 2) : eaters;
      if (servingsMade > eaters) leftovers.push({ recipe: pick.r, servings: servingsMade - eaters, madeOn: i });
      for (const ing of pick.r.ingredients || []) if (ing.food) weekFoods.add(ing.food);
      dayMeals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: eaters, servingsMade, score: Math.round(pick.score), reasons: pick.reasons, check: summarize(pick.check) });
      recentIds.push(pick.r.id);
    }
    days.push({ date: dateKey, day: DAYS[dayIdx], canCook, eaters, minutes: minutesAvailable(cooking, dayIdx), meals: dayMeals, totals: dayTotals });
  }
  return { days, excluded, unmet, eligibleCount: eligible.length, skippedNoNutrition, seed, slots: daySlotList, snacks: snackPlan(person, plan) };
}

// Does a recipe fit a slot? Snack slots take recipes tagged "snack"; components fit nothing.
export function recipeMeal(r, slot) {
  if (isComponent(r)) return false;
  const want = isSnackSlot(slot) ? 'snack' : slot;
  return !r.meal || !r.meal.length || r.meal.includes(want);
}
function summarize(c) { return { verdict: c.verdict, hits: c.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: c.exceeds.map(e => e.nutrient), nutritionUnknown: !!(c.perServing && c.perServing._missing && c.perServing._missing.kcal) && !c.perServing.kcal }; }
