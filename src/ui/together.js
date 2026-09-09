// Together: cooking for more than one person. Builds the strictest combined plan, a short meal plan for the chosen days,
// and a grocery list for it. Profiles can be shared as a file or text and added back as guests. Nothing is uploaded anywhere.
import { buildGroupPlan, exportPersonForSharing } from '../engine/group.js';
import { buildWeekPlan } from '../engine/planner.js';
import { buildGroceryList } from '../engine/grocery.js';
import { newPerson } from '../store.js';
import { uiState, uiEsc, uiActivePerson, uiPersist, uiToast, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiNutrientLabel, uiVerdictWord, uiVerdictChip, uiTagLabel, uiDownload, uiCopyText, uiEnsurePerson, uiSegmented, uiNoticeHTML, uiPageHeader, uiSection, uiChip, uiIcon, uiAvatar, uiEmptyState, uiPlanFor, uiMultiPills } from './common.js';
import { weekRecipeModal, weekGet } from './week.js';
import { groceryIcsForWeek, groceryComputeList } from './grocery.js';
import { SHARE_PARTS, sendShare, listSharesForMe, openShare, listDevices } from '../engine/sync.js';
import { sharingState, sharingLocalHTML, sharingPendingHTML, sharingSafe, sharingDeviceName, sharingPersonModal } from './sharing.js';

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
    ${uiSection('Share with someone', `<div class="card" id="tg-store-share">${togetherStoreShellHTML()}</div>`, { id: 'tg-store-h' })}
    ${uiSection('Shared with me', `<div class="card" id="tg-store-inbox">${togetherStoreShellHTML()}</div>`, { id: 'tg-inbox-h' })}
  `;
  togetherLoadStore(root);
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
  if (list) { list.items = list.items.filter(i => i.food && i.food !== 'undefined'); list.groups = {}; for (const it of list.items) (list.groups[it.group] ||= []).push(it); }
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

// ---- Sharing through the shared store (claude.ai version only) ----
let togetherShareUi = { person: null, device: '', parts: ['rules'], days: [], expiry: 30 };

function togetherStoreShellHTML() {
  const s = sharingState();
  if (!s.ready) return sharingPendingHTML();
  if (!s.db || !s.identity) return sharingLocalHTML();
  return '<p class="small muted">Loading...</p>';
}

async function togetherLoadStore(root) {
  const s = sharingState();
  if (!s.ready || !s.db || !s.identity) return;
  const [devices, shares] = await Promise.all([
    sharingSafe(() => listDevices(s.db), [], 'The device list could not be read.'),
    sharingSafe(() => listSharesForMe(s.db, s.identity), [], 'Shares could not be read right now.')
  ]);
  if (!root.isConnected) return;
  togetherRenderShareForm(root.querySelector('#tg-store-share'), devices);
  togetherRenderInbox(root.querySelector('#tg-store-inbox'), shares, devices);
}

function togetherRenderShareForm(box, devices) {
  const s = sharingState();
  const mine = uiState.profile.people.filter(p => !p.guest);
  const others = devices.filter(d => d && d.fingerprint && d.fingerprint !== s.identity.fingerprint);
  if (!mine.length) { box.innerHTML = '<p class="small muted">Add a person first.</p>'; return; }
  if (!togetherShareUi.person || !mine.find(p => p.id === togetherShareUi.person)) togetherShareUi.person = (uiActivePerson() && !uiActivePerson().guest ? uiActivePerson().id : mine[0].id);
  if (!others.find(d => d.fingerprint === togetherShareUi.device)) togetherShareUi.device = others[0] ? others[0].fingerprint : '';
  const person = mine.find(p => p.id === togetherShareUi.person);
  let week = null;
  try { week = uiState.data.recipes.length ? weekGet(person, uiPlanFor(person)) : null; } catch { week = null; }
  const dayOpts = week ? week.days.map(d => ({ value: d.date, label: uiFmtDate(d.date) })) : [];
  const wantWeek = togetherShareUi.parts.includes('week');
  box.innerHTML = `
    <p class="small">Send parts of a profile to one other device. The package is encrypted for that device only and expires on its own.</p>
    <div class="grid-2">
      <div class="field"><label for="ts-person">Whose profile</label><select id="ts-person">${mine.map(p => `<option value="${uiEsc(p.id)}" ${p.id === togetherShareUi.person ? 'selected' : ''}>${uiEsc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="ts-device">Send to</label><select id="ts-device" ${others.length ? '' : 'disabled'}>${others.length ? others.map(d => `<option value="${uiEsc(d.fingerprint)}" ${d.fingerprint === togetherShareUi.device ? 'selected' : ''}>${uiEsc(d.name || 'Device')}</option>`).join('') : '<option value="">No other device has opened Peace Meal yet</option>'}</select></div>
    </div>
    <div class="field"><span class="label">What to share</span><div class="choice-list">${SHARE_PARTS.map(p => `<label class="choice"><input type="checkbox" data-part="${p.id}" ${togetherShareUi.parts.includes(p.id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(p.label)}</span></span></label>`).join('')}</div></div>
    <div class="field" id="ts-days" ${wantWeek ? '' : 'hidden'}><span class="label">Which days</span>${dayOpts.length ? uiMultiPills('ts-days', dayOpts, togetherShareUi.days.length ? togetherShareUi.days : dayOpts.map(d => d.value), { label: 'Days to share' }) : '<p class="small muted">No week plan is available for this person.</p>'}</div>
    <div class="field"><span class="label">Expires after</span>${uiSegmented('ts-expiry', [{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], togetherShareUi.expiry)}</div>
    <div class="btn-row"><button class="btn primary" type="button" id="ts-send" ${others.length ? '' : 'disabled'}>${uiIcon('share')}Send</button></div>`;
  if (!togetherShareUi.days.length) togetherShareUi.days = dayOpts.map(d => d.value);
  box.querySelector('#ts-person').addEventListener('change', e => { togetherShareUi.person = e.target.value; togetherShareUi.days = []; togetherRenderShareForm(box, devices); });
  const dev = box.querySelector('#ts-device');
  if (dev) dev.addEventListener('change', e => { togetherShareUi.device = e.target.value; });
  box.querySelectorAll('[data-part]').forEach(c => c.addEventListener('change', () => { togetherShareUi.parts = [...box.querySelectorAll('[data-part]')].filter(x => x.checked).map(x => x.dataset.part); box.querySelector('#ts-days').hidden = !togetherShareUi.parts.includes('week'); }));
  box.querySelectorAll('[data-multi="ts-days"]').forEach(c => c.addEventListener('change', () => { togetherShareUi.days = [...box.querySelectorAll('[data-multi="ts-days"]')].filter(x => x.checked).map(x => x.value); c.parentElement.classList.toggle('on', c.checked); }));
  box.querySelectorAll('[data-seg="ts-expiry"]').forEach(r => r.addEventListener('change', () => { togetherShareUi.expiry = Number(r.value); box.querySelectorAll('[data-seg="ts-expiry"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); }));
  box.querySelector('#ts-send').addEventListener('click', async () => {
    const target = others.find(d => d.fingerprint === togetherShareUi.device);
    if (!target) { uiToast('Choose a device to send to.'); return; }
    if (!togetherShareUi.parts.length) { uiToast('Choose at least one part to share.'); return; }
    const extra = {};
    if (togetherShareUi.parts.includes('week') && week) extra.week = { start: week.days[0].date, days: week.days.filter(d => togetherShareUi.days.includes(d.date)).map(d => ({ date: d.date, day: d.day, meals: d.meals.map(m => ({ slot: m.slot, recipe: m.recipe, name: m.name, source: m.source, servings: m.servings })) })) };
    if (togetherShareUi.parts.includes('grocery')) { const g = uiState.data.recipes.length ? groceryComputeList(person) : null; extra.grocery = g ? { week: g.week.days[0].date, items: g.list.items.map(i => ({ food: i.food, name: i.name, group: i.group, quantity: i.quantity, grams: i.grams, removed: !!i.removed })) } : null; }
    const btn = box.querySelector('#ts-send'); btn.disabled = true;
    const res = await sharingSafe(() => sendShare(s.db, s.identity, target, person, togetherShareUi.parts, extra, togetherShareUi.expiry), { ok: false, reason: 'error' });
    btn.disabled = false;
    uiToast(res.ok ? `Sent to ${target.name || 'that device'}. It expires in ${togetherShareUi.expiry} days.` : 'The share could not be sent: ' + (res.reason || 'error'));
  });
}

function togetherRenderInbox(box, shares, devices) {
  const s = sharingState();
  const partLabel = id => { const p = SHARE_PARTS.find(x => x.id === id); return p ? p.label : id; };
  const rows = shares.slice().sort((a, b) => String(b.created || '').localeCompare(String(a.created || '')));
  box.innerHTML = rows.length ? `<div class="list">${rows.map(sh => `<div class="list-row"><div class="list-main"><div class="list-title">${uiIcon('lock')} ${uiEsc(sh.personName || 'Profile')} <span class="muted" style="font-weight:400">from ${uiEsc(sh.fromName || sharingDeviceName(devices, sh.from))}</span></div><div class="list-sub">${(sh.parts || []).map(partLabel).map(uiEsc).join(', ')} · expires ${uiEsc(String(sh.expires || '').slice(0, 10))}</div></div><div class="list-actions"><button class="btn small" type="button" data-open-share="${uiEsc(sh.id)}">Open</button></div></div>`).join('')}</div>`
    : '<p class="small muted">Nothing has been shared with this device yet.</p>';
  box.querySelectorAll('[data-open-share]').forEach(b => b.addEventListener('click', async () => {
    const sh = rows.find(x => x.id === b.dataset.openShare);
    if (!sh) return;
    const pkg = await sharingSafe(() => openShare(s.db, s.identity, sh), null, 'That share could not be opened.');
    if (!pkg) { uiToast('That share could not be decrypted on this device.'); return; }
    sharingPersonModal(pkg, { subtitle: `Shared by ${sh.fromName || sharingDeviceName(devices, sh.from)}; expires ${String(sh.expires || '').slice(0, 10)}.`, sourceKey: 'share:' + (sh.personName || '') + ':' + sh.from });
  }));
}
