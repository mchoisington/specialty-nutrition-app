// Grocery: list from the current week, grouped by food group, with persistent checkboxes and a copy button.
import { buildGroceryList } from '../engine/grocery.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiWeekKey, uiFmtDate, uiToast, uiCopyText } from './common.js';
import { weekGet } from './week.js';

function groceryStorageKey(person) { return 'sn-grocery:' + uiWeekKey(person); }
function groceryLoadChecked(person) {
  try { return new Set(JSON.parse(localStorage.getItem(groceryStorageKey(person)) || '[]')); } catch { return new Set(); }
}
function grocerySaveChecked(person, set) {
  try { localStorage.setItem(groceryStorageKey(person), JSON.stringify([...set])); } catch { /* ignore */ }
}

function grocerySodiumFlag(item) {
  const name = (item.name + ' ' + (item.displays || []).join(' ')).toLowerCase();
  const tags = item.tags || [];
  return /canned|rotisserie|\bcan\b|brine|cured|deli|broth|bouillon|stock\b/.test(name) || tags.some(t => /canned|rotisserie|processed-meat|deli-meat/.test(t));
}

export function renderGroceryScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  if (!uiState.data.recipes.length) {
    root.innerHTML = '<h1>Grocery</h1><p class="empty">No recipes are loaded, so there is no week to shop for.</p>';
    return;
  }
  const week = weekGet(person, plan);
  const list = buildGroceryList(week, uiState.recipesById, uiState.foodsById);
  const checked = groceryLoadChecked(person);
  const groups = Object.entries(list.groups);
  const sodiumItems = list.items.filter(grocerySodiumFlag);
  root.innerHTML = `
    <div class="row between"><h1>Grocery</h1><button class="btn" type="button" id="grocery-copy">Copy list</button></div>
    <p class="muted small">For the week starting ${uiFmtDate(week.days[0].date)}: ${list.items.length} items across ${groups.length} groups. Quantities are summed from recipe grams for the servings you will make. Ticks are remembered on this device for this week.</p>
    ${sodiumItems.length && (plan.limits.sodium_mg || plan.modules.some(m => /hypertension|heart-failure|ckd|kidney/.test(m.id))) ? `<div class="notice warn"><div class="notice-head">Caution</div><div><strong>Sodium:</strong> ${sodiumItems.map(i => uiEsc(i.name)).join(', ')} can carry a lot of salt. Canned goods, broths, and rotisserie chicken are the usual traps. Choose no-salt-added or low-sodium versions and rinse canned beans and vegetables. The plan counts the USDA value for the food as listed.</div></div>` : sodiumItems.length ? `<p class="small muted">Sodium note: ${sodiumItems.map(i => uiEsc(i.name)).join(', ')} tend to be salty. Low-sodium versions exist for most.</p>` : ''}
    ${groups.length ? groups.map(([g, items]) => `<section class="card" aria-labelledby="g-${uiEsc(g).replace(/\W+/g, '-')}">
      <h3 id="g-${uiEsc(g).replace(/\W+/g, '-')}">${uiEsc(g)}</h3>
      ${items.map(it => `<label class="grocery-item ${checked.has(it.food) ? 'checked' : ''}"><input type="checkbox" data-food="${uiEsc(it.food)}" ${checked.has(it.food) ? 'checked' : ''}><span><span class="g-name"><strong>${uiEsc(it.name)}</strong> · ${uiEsc(it.quantity)}</span><br><span class="small muted">For: ${it.uses.map(uiEsc).join(', ')}${it.displays.length ? ' · ' + it.displays.map(uiEsc).join('; ') : ''}</span></span></label>`).join('')}
    </section>`).join('') : '<p class="empty">The week has no cooked meals, so the list is empty.</p>'}
  `;
  root.querySelectorAll('[data-food]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked) checked.add(inp.dataset.food); else checked.delete(inp.dataset.food);
    grocerySaveChecked(person, checked);
    inp.closest('.grocery-item').classList.toggle('checked', inp.checked);
  }));
  root.querySelector('#grocery-copy').addEventListener('click', async () => {
    const lines = [`Grocery list for ${person.name}, week of ${week.days[0].date}`, ''];
    for (const [g, items] of groups) {
      lines.push(g.toUpperCase());
      for (const it of items) lines.push(`${checked.has(it.food) ? '[x]' : '[ ]'} ${it.name}: ${it.quantity} (${it.uses.join(', ')})`);
      lines.push('');
    }
    if (sodiumItems.length) lines.push(`Sodium note: choose low-sodium or no-salt-added versions of ${sodiumItems.map(i => i.name).join(', ')}.`);
    const ok = await uiCopyText(lines.join('\n'));
    uiToast(ok ? 'List copied.' : 'Could not copy. Select the text and copy it by hand.');
  });
}
