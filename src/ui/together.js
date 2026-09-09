// Together: cooking for more than one person. Builds the strictest combined plan, a short meal plan for the chosen days,
// and a grocery list for it. Profiles can be shared as a file or text and added back as guests. Nothing is uploaded anywhere.
import { buildGroupPlan, exportPersonForSharing } from '../engine/group.js';
import { buildWeekPlan } from '../engine/planner.js';
import { buildGroceryList } from '../engine/grocery.js';
import { newPerson } from '../store.js';
import { uiState, uiEsc, uiActivePerson, uiPersist, uiToast, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiVerdictChip, uiTagLabel, uiDownload, uiCopyText, uiEnsurePerson, uiSegmented, uiNoticeHTML, uiPageHeader, uiSection, uiChip, uiIcon, uiAvatar, uiEmptyState } from './common.js';
import { weekRecipeModal } from './week.js';
import { groceryIcsForWeek } from './grocery.js';

const TOGETHER_SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

let togetherUi = { people: null, range: 'weekend', start: null, eaters: null, seed: 0, built: false };

function togetherShift(iso, n) { const [y, m, d] = iso.split('-').map(Number); return uiIsoDate(new Date(y, m - 1, d + n)); }
function togetherNextSaturday(iso) { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(y, m - 1, d); const add = (6 - dt.getDay() + 7) % 7; return uiIsoDate(new Date(y, m - 1, d + add)); }

// Days covered by the chosen range.
function togetherDays() {
  const today = uiIsoDate(uiToday());
  if (togetherUi.range === 'day') return { start: togetherUi.start || today, count: 1 };
  if (togetherUi.range === 'weekend') return { start: togetherNextSaturday(togetherUi.start || today), count: 2 };
  return { start: togetherUi.start || today, count: 7 };
}

export function togetherGroupPerson(selected, eaters, seed) {
  const first = selected[0];
  const union = key => [...new Set(selected.flatMap(p => (p.preferences && p.preferences[key]) || []))];
  const gp = uiEnsurePerson({
    ...JSON.parse(JSON.stringify(first)),
    id: 'group', name: selected.map(p => p.name).join(' and '),
    allergens: [...new Set(selected.flatMap(p => p.allergens || []))],
    preferences: { avoid_tags: union('avoid_tags'), avoid_terms: union('avoid_terms'), patterns: union('patterns') },
    servings_by_day: {}, mealOverrides: {}, favorites: { recipes: [], foods: [] },
    cooking: { ...(first.cooking || {}), household: Math.max(1, Number(eaters) || selected.length) },
    planSeed: seed || 0
  });
  return gp;
}

// Reads a shared profile (from the Together screen's export) into a guest person. Throws on anything that is not one.
export function togetherGuestFromShared(obj) {
  if (!obj || typeof obj !== 'object' || obj.shared !== true) throw new Error('This is not a shared profile. It must come from "Share my profile" and contain "shared": true.');
  if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('The shared profile has no name.');
  const keep = ['adult', 'sex', 'age', 'modules', 'allergens', 'preferences', 'medications', 'pregnancy', 'breastfeeding', 'tier2', 'phases', 'modes', 'variants', 'flags', 'optional_rules', 'rule_settings', 'confirmations', 'acknowledged', 'custom_modules', 'cooking'];
  const p = newPerson(obj.name.trim());
  for (const k of keep) if (obj[k] !== undefined) p[k] = JSON.parse(JSON.stringify(obj[k]));
  p.guest = true;
  p.setup_complete = true;
  p.screen = { scoff: [false, false, false, false, false], positive: false, completed_at: null };
  return uiEnsurePerson(p);
}

export function renderTogetherScreen(root) {
  const profile = uiState.profile;
  const me = uiActivePerson();
  const people = profile.people;
  if (!togetherUi.people || togetherUi.people.some(id => !people.find(p => p.id === id))) togetherUi.people = people.slice(0, 2).map(p => p.id);
  const selected = people.filter(p => togetherUi.people.includes(p.id));
  const eaters = togetherUi.eaters || Math.max(1, selected.length);
  const { start, count } = togetherDays();
  root.innerHTML = `
    ${uiPageHeader('Together', 'Pick who is eating and every plan at the table combines into the strictest one. Sharing a profile is a file or text you send yourself; nothing is uploaded anywhere.')}
    ${uiSection('Who is eating', `<div class="card">
      <div class="group-head"><span class="avatar-stack" aria-hidden="true">${selected.map(p => uiAvatar(p.name, { tone: p.guest ? 'plum' : '' })).join('')}</span><div><strong>${selected.length ? uiEsc(selected.map(p => p.name).join(', ')) : 'Nobody selected'}</strong><div class="small muted">Every allergen and hard exclusion from anyone is hard for the group; each number takes the strictest value.</div></div></div>
      <div class="together-people">${people.map(p => `<label class="choice"><input type="checkbox" data-person="${uiEsc(p.id)}" ${togetherUi.people.includes(p.id) ? 'checked' : ''}><span class="who"><span class="choice-title">${uiEsc(p.name)}</span> ${p.guest ? uiChip('Guest', 'plum') : ''}<div class="hint">${(p.allergens || []).length ? 'Allergens: ' + p.allergens.map(uiTagLabel).map(uiEsc).join(', ') : 'No allergens'}${(p.modules || []).length ? ' · ' + p.modules.length + ' module' + (p.modules.length === 1 ? '' : 's') : ''}</div></span>${p.guest ? `<button class="btn small danger" type="button" data-remove-guest="${uiEsc(p.id)}">Remove</button>` : ''}</label>`).join('')}</div>
      <div class="grid-2">
        <div class="field"><span class="label">Days</span>${uiSegmented('tg-range', [{ value: 'day', label: 'One day' }, { value: 'weekend', label: 'Weekend (Sat to Sun)' }, { value: 'week', label: 'A week' }], togetherUi.range)}</div>
        <div class="field"><label for="tg-start">${togetherUi.range === 'weekend' ? 'Weekend starting' : 'Starting'}</label><input id="tg-start" type="date" value="${uiEsc(start)}"><div class="hint">${togetherUi.range === 'weekend' ? 'Any date rolls forward to the next Saturday.' : ''}</div></div>
        <div class="field"><label for="tg-eaters">Eaters per day</label><input id="tg-eaters" type="number" inputmode="numeric" min="1" max="20" value="${eaters}"></div>
      </div>
      <div class="btn-row"><button class="btn primary" type="button" id="tg-build" ${selected.length ? '' : 'disabled'}>${uiIcon('calendar')}Plan meals together</button>${togetherUi.built ? '<button class="btn" type="button" id="tg-regen">Regenerate</button>' : ''}</div>
    </div>`, { id: 'tg-who-h' })}
    <div id="tg-result" class="stack-2">${togetherUi.built && selected.length ? togetherResultHTML(selected, eaters, start, count) : ''}</div>
    ${uiSection('Share and add guests', `<div class="card">
      <p class="small">Share <strong>${uiEsc(me.name)}</strong>'s conditions, allergens, preferences, and clinician numbers as a small file or text, so another household can cook for them. No log, weights, or diary is included.</p>
      <div class="btn-row"><button class="btn primary" type="button" id="tg-share-file">${uiIcon('share')}Share my profile (file)</button><button class="btn" type="button" id="tg-share-copy">${uiIcon('copy')}Copy as text</button></div>
      <h3>Add a guest</h3>
      <p class="small muted">Paste the text someone sent you, or choose their file. Guests get a "Guest" chip, can be picked above, and can be removed at any time here or on the Settings screen.</p>
      <div class="field"><label for="tg-paste">Paste shared profile</label><textarea id="tg-paste" style="min-height:70px" placeholder='{"shared":true,"name":"..."}'></textarea></div>
      <div class="btn-row"><button class="btn" type="button" id="tg-add-paste">Add guest from text</button><label for="tg-file" class="btn">Choose a file</label><input id="tg-file" type="file" accept="application/json,.json" class="visually-hidden"></div>
    </div>`, { id: 'tg-share-h' })}
  `;
  root.querySelectorAll('[data-person]').forEach(c => c.addEventListener('change', () => {
    togetherUi.people = [...root.querySelectorAll('[data-person]')].filter(x => x.checked).map(x => x.dataset.person);
    togetherUi.eaters = null; togetherUi.built = false; uiState.rerender();
  }));
  root.querySelectorAll('[data-seg="tg-range"]').forEach(r => r.addEventListener('change', () => { togetherUi.range = r.value; togetherUi.built = false; uiState.rerender(); }));
  root.querySelector('#tg-start').addEventListener('change', e => { togetherUi.start = e.target.value || null; togetherUi.built = false; uiState.rerender(); });
  root.querySelector('#tg-eaters').addEventListener('change', e => { togetherUi.eaters = Math.max(1, Number(e.target.value) || 1); togetherUi.built = false; });
  root.querySelector('#tg-build').addEventListener('click', () => { togetherUi.eaters = Math.max(1, Number(root.querySelector('#tg-eaters').value) || 1); togetherUi.built = true; uiState.rerender(); });
  const regen = root.querySelector('#tg-regen');
  if (regen) regen.addEventListener('click', () => { togetherUi.seed++; uiState.rerender(); });
  root.querySelectorAll('[data-remove-guest]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const p = people.find(x => x.id === b.dataset.removeGuest);
    if (!p || !window.confirm(`Remove guest ${p.name}?`)) return;
    profile.people = profile.people.filter(x => x.id !== p.id);
    if (profile.activePerson === p.id) profile.activePerson = profile.people[0] ? profile.people[0].id : null;
    togetherUi.people = togetherUi.people.filter(id => id !== p.id);
    uiPersist(); uiToast(`Removed ${p.name}.`); uiState.rerender();
  }));
  root.querySelector('#tg-share-file').addEventListener('click', () => {
    const ok = uiDownload(`${me.name.replace(/[^\w-]+/g, '-').toLowerCase()}-shared-profile.json`, JSON.stringify(exportPersonForSharing(me), null, 2));
    uiToast(ok ? 'Export started. Send the file to the other household.' : 'Download blocked here. Use "Copy as text".');
  });
  root.querySelector('#tg-share-copy').addEventListener('click', async () => {
    const ok = await uiCopyText(JSON.stringify(exportPersonForSharing(me)));
    uiToast(ok ? 'Copied. Paste it into a message to the other household.' : 'Could not copy.');
  });
  const addGuest = text => {
    try {
      const guest = togetherGuestFromShared(JSON.parse(text));
      profile.people.push(guest);
      togetherUi.people.push(guest.id);
      togetherUi.eaters = null; togetherUi.built = false;
      uiPersist(); uiToast(`Added ${guest.name} as a guest.`); uiState.rerender();
    } catch (err) { uiToast('Could not add guest: ' + (err && err.message ? err.message : 'not valid JSON')); }
  };
  root.querySelector('#tg-add-paste').addEventListener('click', () => { const t = root.querySelector('#tg-paste').value.trim(); if (!t) { uiToast('Paste the shared profile first.'); return; } addGuest(t); });
  root.querySelector('#tg-file').addEventListener('change', e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { addGuest(String(reader.result)); e.target.value = ''; };
    reader.readAsText(file);
  });
  togetherBindResult(root);
}

let togetherLast = null;

function togetherResultHTML(selected, eaters, start, count) {
  const group = buildGroupPlan({ people: selected, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, today: uiToday() });
  const gp = togetherGroupPerson(selected, eaters, togetherUi.seed);
  const [y, m, d] = start.split('-').map(Number);
  const startDate = new Date(y, m - 1, d);
  const week = uiState.data.recipes.length ? buildWeekPlan({ person: gp, plan: group, recipes: uiState.data.recipes, foodsById: uiState.foodsById, matcher: uiState.matcher, startDate, seed: togetherUi.seed }) : null;
  const days = week ? week.days.slice(0, count) : [];
  const list = week ? buildGroceryList({ days }, uiState.recipesById, uiState.foodsById) : null;
  togetherLast = { group, gp, week, days, list };
  const hard = Object.entries(group.avoid).filter(([, a]) => a.hard);
  const soft = Object.entries(group.avoid).filter(([, a]) => !a.hard);
  const who = arr => `<span class="who">(${[...new Set(arr)].map(uiEsc).join(', ')})</span>`;
  const warn = group.notices.filter(n => n.level !== 'info');
  return `
    ${uiSection(`Combined plan for ${uiEsc(selected.map(p => p.name).join(', '))}`, `<div class="card">
      ${warn.length ? `<div class="stack">${warn.map(n => uiNoticeHTML(n)).join('')}</div>` : ''}
      <h3>Hard exclusions</h3>${hard.length ? `<ul class="together-list">${hard.map(([tag, a]) => `<li>${uiChip('hard', 'stop')} <strong>${uiEsc(uiTagLabel(tag))}</strong> ${who(a.people)}</li>`).join('')}</ul>` : '<p class="small muted">None.</p>'}
      <h3>Avoid (soft)</h3>${soft.length ? `<ul class="together-list">${soft.map(([tag, a]) => `<li>${uiChip('soft', 'caution')} ${uiEsc(uiTagLabel(tag))} ${who(a.people)}</li>`).join('')}</ul>` : '<p class="small muted">None.</p>'}
      <h3>Strictest numbers</h3>${Object.keys(group.limits).length || Object.keys(group.targets).length ? `<ul class="together-list">${Object.entries(group.limits).map(([n, l]) => `<li>${uiEsc(uiNutrientLabel(n))}: at most <strong class="num">${uiFmtNum(l.value, 1)}</strong> ${who(l.people)}</li>`).join('')}${Object.entries(group.targets).map(([n, t]) => `<li>${uiEsc(uiNutrientLabel(n))}: at least <strong class="num">${uiFmtNum(t.min, 1)}</strong> ${who(t.people)}</li>`).join('')}</ul>` : '<p class="small muted">No numeric limits or targets.</p>'}
    </div>`, { id: 'tg-plan-h' })}
    ${week ? `${uiSection(`Meals, ${count === 1 ? uiFmtDate(days[0].date) : uiFmtDate(days[0].date) + ' to ' + uiFmtDate(days[days.length - 1].date)}`, `
      <p class="small muted">${eaters} eater${eaters === 1 ? '' : 's'} per day, using ${uiEsc(selected[0].name)}'s cooking time, skill, and equipment. ${week.eligibleCount} of ${uiState.data.recipes.length} recipes are eligible for the group; ${week.excluded.length} are excluded by a hard rule.</p>
      <div class="week-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">${days.map(dd => `<div class="week-day"><div class="week-day-head"><div class="week-day-name">${uiFmtDate(dd.date)}</div><div class="week-day-meta">${dd.canCook ? uiChip('can cook', 'pass') : uiChip('no cooking', 'neutral')}</div></div>
        ${dd.meals.map(mm => `<div class="week-meal"><div class="slot">${TOGETHER_SLOT_LABEL[mm.slot] || mm.slot}</div>
          ${mm.recipe ? `<button type="button" class="meal-chip" data-tg-recipe="${uiEsc(mm.recipe)}"><span class="dot ${mm.check.verdict}" aria-hidden="true"></span><span class="meal-chip-text"><span class="meal-chip-name">${uiEsc(mm.name)}</span><span class="meal-chip-sub"><span class="visually-hidden">${uiVerdictWord(mm.check.verdict)}. </span>${mm.source === 'leftover' ? 'Leftovers' : mm.source === 'assembly' ? 'Assembly' : 'Cook'}, ${mm.servings} serving${mm.servings === 1 ? '' : 's'}</span></span></button>
          ${mm.check.hits && mm.check.hits.length ? `<div class="meal-note">Caution: ${mm.check.hits.map(h => uiEsc(h.label)).join(', ')}</div>` : ''}` : '<div class="muted small">No recipe fit this slot.</div>'}</div>`).join('')}
      </div>`).join('')}</div>
      <details><summary>Excluded recipes (${week.excluded.length})</summary>${week.excluded.length ? `<ul class="small">${week.excluded.map(x => `<li>${uiEsc(x.name)}${x.why.length ? ': ' + x.why.map(uiEsc).join(', ') : ''}</li>`).join('')}</ul>` : '<p class="small muted">None.</p>'}</details>`, { id: 'tg-meals-h' })}
    ${uiSection('Grocery list for these meals', `${list.items.length ? Object.entries(list.groups).map(([g, items]) => `<div class="grocery-group"><div class="grocery-group-head" style="position:static"><h3>${uiEsc(g)}</h3><span class="count">${items.length}</span></div>${items.map(it => `<div class="list-row"><div class="list-main"><div class="list-title">${uiEsc(it.name)} <span class="muted" style="font-weight:400">· ${uiEsc(it.quantity)}</span></div><div class="list-sub">For: ${it.uses.map(uiEsc).join(', ')}</div></div></div>`).join('')}</div>`).join('') : '<p class="small muted">No cooked meals, so nothing to buy.</p>'}
      <div class="btn-row"><button class="btn primary" type="button" id="tg-copy">${uiIcon('copy')}Copy list</button><button class="btn" type="button" id="tg-ics">${uiIcon('calendar')}Add to calendar (.ics)</button></div>`, { id: 'tg-groc-h' })}` : uiEmptyState('No recipes are loaded, so meals cannot be planned.')}`;
}

function togetherBindResult(root) {
  if (!togetherLast) return;
  const { group, gp, week, days, list } = togetherLast;
  root.querySelectorAll('[data-tg-recipe]').forEach(b => b.addEventListener('click', () => weekRecipeModal(b.dataset.tgRecipe, gp, group)));
  const copy = root.querySelector('#tg-copy');
  if (copy) copy.addEventListener('click', async () => {
    const lines = [`Grocery list for ${gp.name}, ${days[0].date}${days.length > 1 ? ' to ' + days[days.length - 1].date : ''}`, ''];
    for (const [g, items] of Object.entries(list.groups)) { lines.push(g.toUpperCase()); for (const it of items) lines.push(`[ ] ${it.name}: ${it.quantity} (${it.uses.join(', ')})`); lines.push(''); }
    const ok = await uiCopyText(lines.join('\n'));
    uiToast(ok ? 'List copied.' : 'Could not copy.');
  });
  const ics = root.querySelector('#tg-ics');
  if (ics) ics.addEventListener('click', () => {
    const ok = uiDownload(`meals-together-${days[0].date}.ics`, groceryIcsForWeek(week, gp, { days, uidTag: 'together' }), 'text/calendar');
    uiToast(ok ? 'Calendar file started.' : 'Download blocked here.');
  });
}
