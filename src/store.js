// On-device persistence. Nothing leaves the device unless the user exports it.
const KEY = 'specialty-nutrition-app:v1';

export function defaultProfile() {
  return { version: 1, people: [], log: [], activePerson: null, created: new Date().toISOString() };
}

export function newPerson(name = 'Me') {
  const id = 'p' + Math.random().toString(36).slice(2, 8);
  return {
    id, name, adult: true, sex: '', age: null, weight_kg: null, height_cm: null,
    modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [], patterns: [] },
    medications: { potassium_retaining: false, insulin_or_su: false, sglt2: false, levothyroxine: false },
    pregnancy: false, breastfeeding: false, tier2: {},
    screen: { scoff: [false, false, false, false, false], positive: false, completed_at: null },
    phases: {}, modes: {}, acknowledged: [],
    cooking: { weekday_minutes: 20, weekend_minutes: 40, cook_days: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], interest: 'simple', skill: 'comfortable', equipment: ['stove', 'oven', 'microwave'], leftovers: 'ok', household: 1, grocery: 'supermarket' },
    planSeed: 0
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.people)) return defaultProfile();
    return p;
  } catch { return defaultProfile(); }
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
  return p;
}

export function clearAll() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
