// Household week: one shared week planned seating by seating (who is at which meal on which day).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildMatcher } from '../src/engine/dictionary.js';
import { rosterFor, seatingPerson, buildHouseholdWeek, householdRepick, householdDefaults, householdSlots, cookFor } from '../src/engine/household.js';
import { recipeHeat } from '../src/engine/spice.js';

const read = f => JSON.parse(fs.readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
const conditions = read('conditions.json');
const dictionaries = read('dictionaries.json');
const foods = read('foods.json');
const recipes = [...read('recipes.json'), ...read('recipes-open.json')];
const foodsById = new Map(foods.map(f => [f.id, f]));
const matcher = buildMatcher(dictionaries);
const byId = new Map(recipes.map(r => [r.id, r]));

function person(id, name, extra = {}) {
  return {
    id, name, adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [], medications: {}, tier2: {},
    favorites: { recipes: [], foods: [] }, disliked: { recipes: [], foods: [] }, servings_by_day: {},
    cooking: { weekday_minutes: 30, weekend_minutes: 45, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave', 'blender'], leftovers: 'ok' },
    ...extra
  };
}
const mom = person('mom', 'Mom', { modules: ['gerd'] });
const dad = person('dad', 'Dad', { modules: ['hypertension'] });
const teen = person('teen', 'Alex', { adult: false, allergens: ['allergen-peanut'], preferences: { avoid_tags: [], avoid_terms: [], patterns: [], spice: 'none' } });
const kid = person('kid', 'Sam', { adult: false });
const guest = person('gma', 'Grandma', { guest: true, allergens: ['allergen-shellfish'] });
const people = [mom, dad, teen, kid, guest];
const start = new Date('2026-09-14T00:00:00Z');   // a Monday

test('roster: everyone in by default, guests out, weekly pattern and per-date exceptions', () => {
  const h = householdDefaults();
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'dinner').map(p => p.id), ['mom', 'dad', 'teen', 'kid']);
  h.pattern.teen = { tue: { dinner: false }, thu: { dinner: false } };
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'dinner').map(p => p.id), ['mom', 'dad', 'kid']);
  assert.deepEqual(rosterFor(h, people, '2026-09-15', 'tue', 'lunch').map(p => p.id), ['mom', 'dad', 'teen', 'kid']);
  h.roster['2026-09-20'] = { dinner: ['mom', 'dad', 'kid', 'gma'] };
  assert.deepEqual(rosterFor(h, people, '2026-09-20', 'sun', 'dinner').map(p => p.id), ['mom', 'dad', 'kid', 'gma']);
  assert.equal(cookFor(h, people, '2026-09-15').id, 'mom', 'first adult non-guest cooks by default');
  h.cook = 'dad'; assert.equal(cookFor(h, people, '2026-09-15').id, 'dad');
  h.cook_by_date['2026-09-15'] = 'mom'; assert.equal(cookFor(h, people, '2026-09-15').id, 'mom');
  assert.deepEqual(householdSlots(h), ['breakfast', 'lunch', 'snack-pm', 'dinner']);
});

test('seating person: strictest spice, every allergen, everyone\'s never-agains, kids-only means assembly', () => {
  const sp = seatingPerson([mom, teen], mom, { budget: true });
  assert.equal(sp.preferences.spice, 'none');
  assert.deepEqual(sp.allergens, ['allergen-peanut']);
  assert.equal(sp.kidsOnly, false);
  assert.equal(sp.cooking.household, 2);
  assert.equal(sp.cooking.budget, true);
  const kids = seatingPerson([teen, kid], mom);
  assert.equal(kids.kidsOnly, true);
  assert.equal(kids.cooking.interest, 'assembly');
});

test('household week: each seating is planned for its own eaters; servings follow the roster; kids-only seatings do not cook', () => {
  const h = householdDefaults();
  h.pattern.teen = { tue: { dinner: false }, thu: { dinner: false } };
  h.pattern.mom = { mon: { lunch: false } };
  h.roster['2026-09-16'] = { dinner: ['teen', 'kid'] };   // parents out Wednesday night
  h.roster['2026-09-20'] = { dinner: ['mom', 'dad', 'kid', 'gma'] };
  const week = buildHouseholdWeek({ people, household: h, conditions, dictionaries, recipes, foodsById, matcher, startDate: start, seed: 1 });
  assert.equal(week.days.length, 7);
  const tue = week.days.find(d => d.date === '2026-09-15');
  const tueDinner = tue.meals.find(m => m.slot === 'dinner');
  assert.deepEqual(tueDinner.eaters, ['mom', 'dad', 'kid']);
  assert.equal(tueDinner.servings, 3);
  const monLunch = week.days.find(d => d.date === '2026-09-14').meals.find(m => m.slot === 'lunch');
  assert.deepEqual(monLunch.eaters, ['dad', 'teen', 'kid']);
  const wedDinner = week.days.find(d => d.date === '2026-09-16').meals.find(m => m.slot === 'dinner');
  assert.deepEqual(wedDinner.eaters, ['teen', 'kid']);
  assert.equal(wedDinner.kidsOnly, true);
  if (wedDinner.recipe) { const r = byId.get(wedDinner.recipe); assert.ok(r.assembly_only || (r.active_min || 0) <= 10 || wedDinner.source === 'leftover', `kids-only dinner should be assembly or leftovers, got ${r.name} (${r.active_min} min)`); }
  const sunDinner = week.days.find(d => d.date === '2026-09-20').meals.find(m => m.slot === 'dinner');
  assert.deepEqual(sunDinner.eaters, ['mom', 'dad', 'kid', 'gma']);
  assert.equal(sunDinner.servings, 4);
  // every meal the teenager eats respects the teenager's rules: no peanut, no heat
  for (const d of week.days) for (const m of d.meals) {
    if (!m.recipe || !m.eaters.includes('teen')) continue;
    const r = byId.get(m.recipe);
    assert.equal(recipeHeat(r).level, 0, `${r.name} has heat but Alex (no heat) is at that seating`);
    assert.ok(!(m.check.hits || []).some(x => x.tag === 'allergen-peanut'), `${r.name} carries peanut with Alex present`);
  }
  // the grandma-only allergen only binds where she is rostered
  assert.ok(week.seatings.length >= 4, `distinct seatings planned: ${week.seatings.length}`);
  assert.ok(week.days.every(d => d.meals.length === 4));
});

test('householdRepick replaces only the named slot and keeps the week untouched', () => {
  const h = householdDefaults();
  const week = buildHouseholdWeek({ people, household: h, conditions, dictionaries, recipes, foodsById, matcher, startDate: start, seed: 2 });
  const before = JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe)));
  const { meals } = householdRepick({ week, di: 3, slots: ['dinner'], people, household: h, conditions, dictionaries, recipes, foodsById, matcher, canCook: true, minutes: 10 });
  assert.equal(meals.length, 1);
  assert.ok(meals[0].repicked);
  if (meals[0].recipe) { const r = byId.get(meals[0].recipe); assert.ok((r.active_min || 0) <= 10 || r.assembly_only, `picked ${r.name} for a 10 minute day`); }
  assert.equal(JSON.stringify(week.days.map(d => d.meals.map(m => m.recipe))), before);
});
