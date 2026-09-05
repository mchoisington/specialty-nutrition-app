// Grocery list from a week plan: sums grams per food across cooked meals, converts to portions when a natural portion exists.
export function buildGroceryList(week, recipesById, foodsById) {
  const need = new Map(); // foodId -> {grams, uses:[recipe names]}
  for (const day of week.days) {
    for (const m of day.meals) {
      if (!m.recipe || m.source === 'leftover') continue;
      const r = recipesById.get(m.recipe);
      if (!r) continue;
      const factor = (m.servingsMade || m.servings || r.servings) / (r.servings || 1);
      for (const ing of r.ingredients || []) {
        const cur = need.get(ing.food) || { grams: 0, uses: new Set(), displays: new Set() };
        cur.grams += (Number(ing.grams) || 0) * factor;
        cur.uses.add(r.name);
        if (ing.display) cur.displays.add(ing.display);
        need.set(ing.food, cur);
      }
    }
  }
  const items = [];
  for (const [foodId, v] of need) {
    const food = foodsById.get(foodId);
    const name = food ? (food.short || food.name) : foodId;
    const group = food ? food.group : 'Other';
    const portion = food && food.portions ? food.portions.find(p => p.grams && p.grams !== 100 && !/^100 g$/.test(p.label)) : null;
    let quantity = `${Math.round(v.grams)} g`;
    if (portion) {
      const n = v.grams / portion.grams;
      quantity = `${roundNice(n)} x ${portion.label} (${Math.round(v.grams)} g)`;
    }
    items.push({ food: foodId, name, group, grams: Math.round(v.grams), quantity, uses: [...v.uses], displays: [...v.displays], tags: food ? food.tags : [] });
  }
  items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  const groups = {};
  for (const it of items) (groups[it.group] ||= []).push(it);
  return { items, groups };
}
function roundNice(n) { if (n < 1) return Math.max(0.25, Math.round(n * 4) / 4); if (n < 10) return Math.round(n * 2) / 2; return Math.round(n); }
