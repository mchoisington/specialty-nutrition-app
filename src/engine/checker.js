// Checks foods, ingredient text, and recipes against a plan.
// Verdicts: fail (hard exclusion hit), caution (soft avoid, unknown-risk term, or unrecognized text while an allergen is selected), pass.
// Unrecognized text is always reported. It is never counted as safe.
import { recipeTotals, derived, round } from './nutrition.js';

function evaluateTags(tagMap, plan, matcher, opts = {}) {
  const hits = [];
  const preferHits = [];
  for (const [tag, terms] of Object.entries(tagMap)) {
    const av = plan.avoid && plan.avoid[tag];
    if (av) hits.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, hard: !!av.hard, terms: Array.isArray(terms) ? terms : [], rules: av.rules });
    if (plan.prefer && plan.prefer[tag]) preferHits.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, rules: plan.prefer[tag].rules });
  }
  hits.sort((a, b) => (b.hard - a.hard));
  return { hits, preferHits };
}

export function verdictFrom({ hits, unknownRisk, unrecognized, hasAllergens, termHits, verifyLabel }) {
  if (hits.some(h => h.hard) || (termHits || []).some(t => t.hard)) return 'fail';
  if (hits.length || (termHits || []).length) return 'caution';
  if (verifyLabel && verifyLabel.length) return 'caution';
  if (unknownRisk && unknownRisk.length && hasAllergens) return 'caution';
  if (unrecognized && unrecognized.length && hasAllergens) return 'caution';
  return 'pass';
}

// Ingredients that often, but not always, carry a restricted tag: the label must be checked; never counted as passing.
function verifyLabelHits(mayContain, plan, matcher) {
  const out = [];
  for (const [tag, terms] of Object.entries(mayContain || {})) {
    const av = plan.avoid && plan.avoid[tag];
    if (av) out.push({ tag, label: matcher ? matcher.tagLabel(tag) : tag, hard: !!av.hard, terms, rules: av.rules });
  }
  return out;
}

export function checkText(text, plan, matcher, person = {}) {
  const r = matcher.tagText(text);
  const { hits, preferHits } = evaluateTags(r.tags, plan, matcher);
  const hasAllergens = !!(person.allergens && person.allergens.length);
  const termHits = matchAvoidTerms(text, person);
  const verifyLabel = verifyLabelHits(r.mayContain, plan, matcher);
  const verdict = verdictFrom({ hits, unknownRisk: r.unknownRisk, unrecognized: r.unrecognized, hasAllergens, termHits, verifyLabel });
  return { verdict, hits, preferHits, termHits, verifyLabel, unknownRisk: r.unknownRisk, unrecognized: r.unrecognized, notes: r.notes, tags: r.tags, mayContain: r.mayContain, segments: r.segments };
}

function matchAvoidTerms(text, person) {
  const terms = (person.preferences && person.preferences.avoid_terms) || [];
  const t = String(text || '').toLowerCase();
  return terms.filter(x => x && t.includes(String(x).toLowerCase())).map(term => ({ term, hard: false }));
}

export function checkFood(food, plan, matcher, person = {}) {
  const tagMap = {};
  for (const tag of food.tags || []) tagMap[tag] = [food.short || food.name];
  const { hits, preferHits } = evaluateTags(tagMap, plan, matcher);
  const termHits = matchAvoidTerms(food.name + ' ' + (food.short || ''), person);
  const verdict = verdictFrom({ hits, unknownRisk: [], unrecognized: [], hasAllergens: false, termHits });
  return { verdict, hits, preferHits, termHits, tags: tagMap };
}

export function checkRecipe(recipe, plan, matcher, foodsById, person = {}) {
  const tagMap = {};
  const addTag = (tag, src) => { if (!tagMap[tag]) tagMap[tag] = []; if (!tagMap[tag].includes(src)) tagMap[tag].push(src); };
  const unknownRisk = [];
  const unrecognized = [];
  const mayContain = {};
  for (const ing of recipe.ingredients || []) {
    const food = foodsById.get(ing.food);
    const label = ing.display || (food ? food.short || food.name : ing.food);
    if (food) for (const tag of food.tags || []) addTag(tag, label);
    // display text goes through the dictionary too (e.g. "soy sauce" as display on a generic food)
    if (matcher && ing.display) {
      const r = matcher.tagText(ing.display);
      for (const tag of Object.keys(r.tags)) addTag(tag, label);
      for (const [tag, terms] of Object.entries(r.mayContain || {})) (mayContain[tag] ||= []).push(...terms);
      for (const u of r.unknownRisk) unknownRisk.push(u);
      if (!food && r.unrecognized.length) unrecognized.push(label);
    }
    if (!food && !ing.display) unrecognized.push(ing.food);
  }
  for (const tag of recipe.tags || []) addTag(tag, 'recipe');
  const { hits, preferHits } = evaluateTags(tagMap, plan, matcher);
  const termHits = matchAvoidTerms(recipe.name + ' ' + (recipe.ingredients || []).map(i => i.display || '').join(' '), person);
  const hasAllergens = !!(person.allergens && person.allergens.length);
  for (const t of Object.keys(tagMap)) delete mayContain[t];
  const verifyLabel = verifyLabelHits(mayContain, plan, matcher);
  const verdict = verdictFrom({ hits, unknownRisk, unrecognized, hasAllergens, termHits, verifyLabel });
  const nut = recipeTotals(recipe, foodsById);
  const perServing = nut.perServing;
  const d = derived(perServing);
  const vsLimits = [];
  for (const [n, lim] of Object.entries(plan.limits || {})) {
    const v = n in d ? d[n] : perServing[n];
    if (v == null) continue;
    vsLimits.push({ nutrient: n, perServing: round(v, 1), dailyLimit: lim.value, pctOfDaily: round(v / lim.value * 100), exceedsInOneServing: v > lim.value, missingData: !!(perServing._missing && perServing._missing[n]) });
  }
  const exceeds = vsLimits.filter(x => x.exceedsInOneServing);
  const finalVerdict = exceeds.length && verdict !== 'fail' ? 'caution' : verdict;
  return { verdict: finalVerdict, hits, preferHits, termHits, verifyLabel, unknownRisk, unrecognized, tags: tagMap, perServing, vsLimits, exceeds, missingFoods: nut.missingFoods };
}
