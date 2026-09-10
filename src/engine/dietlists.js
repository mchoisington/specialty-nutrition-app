// Approved-food lists for elimination diets (data/diet-lists.json), with per-person additions.
//
// Strict mode: when a person's plan restricts a diet family (low FODMAP, low histamine) and strict mode is on for it
// (the default), a recipe counts as safe only when every ingredient is on the family's approved list or on the person's
// own "tolerated" list, and on neither the family's nor the person's "reacts" list. Anything else is a caution, with the
// ingredient named. This closes the gap where an ingredient that carries no avoid tag was treated as fine because the
// dictionary simply did not know it.
//
// Matching is by word or phrase against the ingredient text and the linked food's name, after stripping amounts.

const DIET_NOISE = /\b(\d+[\d\/.,½¼¾⅓⅔-]*|cups?|tbsps?|tablespoons?|tsps?|teaspoons?|oz|ounces?|lbs?|pounds?|g|grams?|kg|ml|l|litres?|liters?|cans?|tins?|jars?|packets?|packages?|pkg|cloves?|slices?|pieces?|pinch|dash|handfuls?|large|medium|small|extra|about|approx\w*|to taste|optional|fresh|frozen|canned|tinned|dried|dry|chopped|diced|minced|sliced|cubed|shredded|grated|crushed|rinsed|drained|cooked|raw|peeled|seeded|halved|quartered|trimmed|thawed|softened|melted|divided|packed|heaping|heaped|level|thinly|thickly|finely|coarsely|roughly|plus|or|of|and|for|the|a|an|into|cut|torn|whole|ripe|firm|young|baby|plain|uncooked|unsalted|salted|low-fat|reduced-fat|lean)\b/gi;

export function dietNormalize(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9%\s-]/g, ' ').replace(DIET_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

function dietTermRegex(term) {
  const t = dietNormalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
  if (!t) return null;
  // allow a trailing s/es on the last word so "carrot" matches "carrots"
  return new RegExp('(^|[^a-z])' + t + '(e?s)?([^a-z]|$)', 'i');
}

const DIET_INDEX = new WeakMap();
function dietFamilyIndex(lists, family) {
  let byFam = DIET_INDEX.get(lists);
  if (!byFam) { byFam = new Map(); DIET_INDEX.set(lists, byFam); }
  if (byFam.has(family)) return byFam.get(family);
  const fam = lists.families[family];
  const approved = [];
  const reacts = [];
  for (const g of (fam && fam.groups) || []) for (const it of g.items || []) {
    for (const term of [it.term, ...(it.aliases || [])]) { const re = dietTermRegex(term); if (re) approved.push({ re, item: it, group: g.name }); }
  }
  for (const it of (fam && fam.avoid_examples) || []) { const re = dietTermRegex(it.term); if (re) reacts.push({ re, item: it }); }
  const idx = { approved, reacts };
  byFam.set(family, idx);
  return idx;
}

// Families in the lists whose tags the plan avoids.
export function strictFamiliesFor(plan, lists) {
  const avoid = (plan && plan.avoid) || {};
  return Object.entries((lists && lists.families) || {}).filter(([, f]) => (f.tags || []).some(t => avoid[t])).map(([id]) => id);
}

// Strict mode is on unless the person switched it off for that family.
export function strictOn(person, family) {
  const s = person && person.strict_diets;
  return !(s && s[family] === false);
}

function dietPersonLists(person, family) {
  const p = (person && person.diet_lists && person.diet_lists[family]) || {};
  return { tolerated: (p.tolerated || []).map(x => ({ ...x, re: dietTermRegex(x.term) })).filter(x => x.re), reacts: (p.reacts || []).map(x => ({ ...x, re: dietTermRegex(x.term) })).filter(x => x.re) };
}

// Is this ingredient text on the approved list for the family, for this person?
// Returns { approved, why, item } where why is 'reacts' | 'tolerated' | 'list' | 'unlisted'.
export function approvedFor(text, family, lists, person) {
  const n = dietNormalize(text);
  if (!n) return { approved: true, why: 'empty' };
  const mine = dietPersonLists(person, family);
  for (const r of mine.reacts) if (r.re.test(n)) return { approved: false, why: 'reacts', item: r };
  for (const t of mine.tolerated) if (t.re.test(n)) return { approved: true, why: 'tolerated', item: t };
  const idx = dietFamilyIndex(lists, family);
  for (const a of idx.approved) if (a.re.test(n)) return { approved: true, why: 'list', item: a.item, group: a.group };
  return { approved: false, why: 'unlisted' };
}

// Strict check for a recipe. Returns { families, notApproved: [{ label, family, why }] }.
export function strictCheck(recipe, plan, lists, foodsById, person = {}) {
  const families = strictFamiliesFor(plan, lists).filter(f => strictOn(person, f));
  const notApproved = [];
  if (!families.length) return { families, notApproved };
  for (const ing of recipe.ingredients || []) {
    const food = ing.food && foodsById ? foodsById.get(ing.food) : null;
    const label = ing.display || (food ? food.short || food.name : ing.food) || '';
    const texts = [ing.display, food ? food.short : null, food ? food.name : null].filter(Boolean);
    for (const family of families) {
      let verdict = null;
      for (const t of texts) { const r = approvedFor(t, family, lists, person); if (r.why === 'reacts') { verdict = r; break; } if (r.approved) verdict = r; }
      if (!verdict || !verdict.approved) notApproved.push({ label, family, why: verdict ? verdict.why : 'unlisted' });
    }
  }
  return { families, notApproved };
}

export function familyLabel(lists, family) { const f = lists && lists.families && lists.families[family]; return f ? f.label : family; }
