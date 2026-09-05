// Weekly meal plan. Deterministic given a seed. Hard exclusions are never scheduled.
// Scoring blends: hard/soft avoid, prefer tags, time fit, skill and equipment fit, leftovers tolerance, variety, and daily nutrient limits.
import { checkRecipe } from './checker.js';
import { emptyTotals, addTotals, scaleTotals, recipeTotals, derived } from './nutrition.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const SKILL = { beginner: 0, comfortable: 1, confident: 2 };

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function minutesAvailable(cooking, dayIdx) {
  const weekend = dayIdx === 0 || dayIdx === 6;
  const m = weekend ? cooking.weekend_minutes : cooking.weekday_minutes;
  return Number(m) || 20;
}

export function scoreRecipe({ recipe, check, cooking, dayIdx, canCook, recentIds, dayTotals, plan, foodsById }) {
  if (check.verdict === 'fail') return { score: -Infinity, reasons: ['hard exclusion'] };
  const reasons = [];
  let score = 100;
  // soft avoid
  for (const h of check.hits) { score -= 25; reasons.push(`contains ${h.label} (avoid)`); }
  for (const t of check.termHits || []) { score -= 15; reasons.push(`contains "${t.term}" (your preference)`); }
  if (check.unknownRisk.length) { score -= 5; }
  // prefer
  score += Math.min(30, check.preferHits.length * 6);
  // time
  const avail = minutesAvailable(cooking, dayIdx);
  if (!canCook) {
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

export function buildWeekPlan({ person, plan, recipes, foodsById, matcher, startDate = new Date(), seed = 0, slots = ['breakfast', 'lunch', 'dinner'] }) {
  const cooking = person.cooking || {};
  const rnd = mulberry32(hashStr(person.id + '|' + startDate.toISOString().slice(0, 10) + '|' + seed));
  const checks = new Map(recipes.map(r => [r.id, checkRecipe(r, plan, matcher, foodsById, person)]));
  const eligible = recipes.filter(r => checks.get(r.id).verdict !== 'fail');
  const excluded = recipes.filter(r => checks.get(r.id).verdict === 'fail').map(r => ({ id: r.id, name: r.name, why: checks.get(r.id).hits.filter(h => h.hard).map(h => h.label) }));
  const days = [];
  const recentIds = [];
  const leftovers = []; // {recipeId, servings, madeOn}
  const household = Math.max(1, Number(cooking.household) || 1);
  const cookDays = new Set(cooking.cook_days && cooking.cook_days.length ? cooking.cook_days : DAYS);
  const unmet = [];

  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate.getTime() + i * 86400000);
    const dayIdx = date.getDay();
    const canCook = cookDays.has(DAYS[dayIdx]);
    let dayTotals = emptyTotals();
    const meals = [];
    for (const slot of slots) {
      // use leftovers first on no-cook days, or when leftovers tolerance is good
      const lo = leftovers.find(l => l.servings >= household && (i - l.madeOn) <= 3 && recipeMeal(l.recipe, slot));
      if (lo && (!canCook || cooking.leftovers === 'good' && rnd() < 0.5)) {
        lo.servings -= household;
        const per = recipeTotals(lo.recipe, foodsById).perServing;
        dayTotals = addTotals(dayTotals, per);
        meals.push({ slot, recipe: lo.recipe.id, name: lo.recipe.name, source: 'leftover', servings: household, check: summarize(checks.get(lo.recipe.id)) });
        recentIds.push(lo.recipe.id);
        continue;
      }
      const candidates = eligible.filter(r => recipeMeal(r, slot));
      const scored = candidates.map(r => {
        const check = checks.get(r.id);
        const s = scoreRecipe({ recipe: r, check, cooking, dayIdx, canCook, recentIds, dayTotals, plan, foodsById });
        return { r, check, score: s.score + rnd() * 4, reasons: s.reasons };
      }).filter(x => x.score > -Infinity).sort((a, b) => b.score - a.score);
      if (!scored.length) { unmet.push({ date: date.toISOString().slice(0, 10), slot, why: 'no recipe fits' }); meals.push({ slot, recipe: null, source: 'none' }); continue; }
      const pick = scored[0];
      const per = recipeTotals(pick.r, foodsById).perServing;
      dayTotals = addTotals(dayTotals, per);
      const batch = canCook && (cooking.leftovers !== 'poor') && (pick.r.leftovers === 'good' || pick.r.leftovers === 'ok');
      const servingsMade = batch ? Math.max(pick.r.servings || household, household * 2) : household;
      if (servingsMade > household) leftovers.push({ recipe: pick.r, servings: servingsMade - household, madeOn: i });
      meals.push({ slot, recipe: pick.r.id, name: pick.r.name, source: pick.r.assembly_only ? 'assembly' : 'cook', servings: household, servingsMade, score: Math.round(pick.score), reasons: pick.reasons, check: summarize(pick.check) });
      recentIds.push(pick.r.id);
    }
    days.push({ date: date.toISOString().slice(0, 10), day: DAYS[dayIdx], canCook, minutes: minutesAvailable(cooking, dayIdx), meals, totals: dayTotals });
  }
  return { days, excluded, unmet, eligibleCount: eligible.length, seed };
}

function recipeMeal(r, slot) { return !r.meal || !r.meal.length || r.meal.includes(slot); }
function summarize(c) { return { verdict: c.verdict, hits: c.hits.map(h => ({ tag: h.tag, label: h.label, hard: h.hard })), exceeds: c.exceeds.map(e => e.nutrient) }; }
