// On-device persistence. Nothing leaves the device unless the user exports it.
const KEY = 'peace-meal:v1';
const OLD_KEY = 'specialty-nutrition-app:v1';

export function defaultProfile() {
  return { version: 2, people: [], log: [], diary: [], weights: [], exercise: [], pantry: [], grocery_adjustments: {}, grocery_changes: {}, custom_recipes: [], recipe_collections: { nhs: false, wikibooks: true, usda: false }, activePerson: null, created: new Date().toISOString() };
}

export function newPerson(name = 'Me') {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  return {
    id, name, adult: true, sex: '', age: null, weight_kg: null, height_cm: null, activity: 'light',
    modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    variants: {}, flags: {}, optional_rules: [], rule_settings: {}, confirmations: [], custom_modules: [],
    goals: { calorie_target: 'off', deficit: 500 },   // calorie_target: 'off' | 'maintain' | 'loss' | 'manual'; manual_kcal when manual
    manual_kcal: null,
    favorites: { recipes: [], foods: [] },
    disliked: { recipes: [], foods: [] },
    servings_by_day: {},
    medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: false },
    pregnancy: false, breastfeeding: false, tier2: {},
    phases: {}, modes: {}, acknowledged: [],
    cooking: { weekday_minutes: 20, weekend_minutes: 40, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket', budget: false },
    planSeed: 0,
    setup_complete: false
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.people)) return defaultProfile();
    return migrate(p);
  } catch { return defaultProfile(); }
}

// Fill in fields added after a profile was first saved. Never removes anything.
export function migrate(p) {
  const d = defaultProfile();
  for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
  const np = newPerson('x');
  for (const person of p.people) {
    for (const k of Object.keys(np)) if (person[k] === undefined && k !== 'id' && k !== 'name') person[k] = JSON.parse(JSON.stringify(np[k]));
    if (person.cooking && person.cooking.budget === undefined) person.cooking.budget = false;
    if (person.setup_complete === undefined) person.setup_complete = !!(person.modules && person.modules.length);
    if (person.cooking && person.cooking.day_minutes) delete person.cooking.day_minutes;   // v1.6 stored Week-screen minutes per weekday; now per date, this week only
  }
  p.version = 2;
  return p;
}

export function save(profile) {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); return true; } catch { return false; }
}

export function exportJSON(profile) {
  return JSON.stringify({ ...profile, exported: new Date().toISOString() }, null, 2);
}

export function importJSON(text) {
  const p = JSON.parse(text);
  if (!p || !Array.isArray(p.people)) throw new Error('Not a valid export file.');
  return migrate(p);
}

export function clearAll() { try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch { /* ignore */ } }
