// People and onboarding stepper. Every change is written to the profile and saved immediately.
import { newPerson } from '../store.js';
import { SCOFF_ITEMS, scoreScoff, SUPPORT_TEXT } from '../engine/screen.js';
import { uiState, uiEsc, uiPersist, uiActivePerson, uiSetActive, uiPlanFor, uiRatingBadge, uiSegmented, uiMultiPills, uiYesNo, uiNavigate, uiToast, uiModal, uiMinutesBucket, uiFindPersonById, UI_ALLERGENS, uiTagLabel, uiModuleName, uiNutrientLabel } from './common.js';
import { learnModuleHTML } from './learn.js';

const PEOPLE_STEPS = [
  { id: 'basics', label: 'About you' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'allergens', label: 'Allergens' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'medications', label: 'Medications' },
  { id: 'clinician', label: 'Clinician numbers' },
  { id: 'screening', label: 'Screening' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'review', label: 'Review' }
];
const PEOPLE_CAREGIVER_STEPS = ['basics', 'conditions', 'allergens', 'cooking', 'review'];

const PEOPLE_PATTERN_TAGS = {
  vegetarian: ['red-meat', 'poultry', 'fish', 'processed-meat'],
  vegan: ['red-meat', 'poultry', 'fish', 'processed-meat', 'allergen-egg', 'allergen-milk'],
  halal: [],
  kosher: []
};
const PEOPLE_PATTERN_TERMS = {
  halal: ['pork', 'bacon', 'ham', 'lard', 'gelatin', 'prosciutto', 'pancetta'],
  kosher: ['pork', 'bacon', 'ham', 'lard', 'gelatin', 'prosciutto', 'pancetta', 'shellfish', 'shrimp', 'prawn', 'crab', 'lobster', 'clam', 'oyster', 'mussel', 'scallop']
};
const PEOPLE_SOFT_AVOID_OPTIONS = [
  { value: 'red-meat', label: 'Red meat' },
  { value: 'processed-meat', label: 'Processed meat' },
  { value: 'poultry', label: 'Poultry' },
  { value: 'fish', label: 'Fish' },
  { value: 'allergen-milk', label: 'Dairy (preference, not allergy)' },
  { value: 'allergen-egg', label: 'Eggs (preference, not allergy)' },
  { value: 'soy', label: 'Soy (preference, not allergy)' },
  { value: 'gluten', label: 'Gluten (preference, not celiac)' },
  { value: 'refined-grain', label: 'Refined grains' },
  { value: 'ultra-processed', label: 'Ultra-processed foods' },
  { value: 'fried', label: 'Fried foods' },
  { value: 'full-fat-dairy', label: 'Full-fat dairy' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'caffeine', label: 'Caffeine' },
  { value: 'non-nutritive-sweetener', label: 'Non-nutritive sweeteners' }
];

let peopleScreenAnswered = new Set();

function peopleStepsFor(person) {
  return person.adult === false ? PEOPLE_STEPS.filter(s => PEOPLE_CAREGIVER_STEPS.includes(s.id)) : PEOPLE_STEPS;
}

function peopleIsCaregiverModule(m) {
  return /celiac/.test(m.id) || m.id === 'food-allergies' || m.id === 'pediatric';
}

function peopleFindPorkTag() {
  const tags = uiState.data.dictionaries.tags || {};
  return Object.keys(tags).find(t => /^pork$|(^|-)pork(-|$)/.test(t)) || null;
}

export function renderPeopleScreen(root, ctx) {
  const parts = ctx.route.parts;
  if (!parts.length) return peopleRenderList(root);
  if (parts[0] === 'new') return peopleRenderNew(root);
  const person = uiFindPersonById(parts[0]);
  if (!person) { root.innerHTML = '<h1>People</h1><p class="empty">That person was not found.</p><a class="btn" href="#/people">Back to people</a>'; return; }
  const steps = peopleStepsFor(person);
  const stepId = steps.some(s => s.id === parts[1]) ? parts[1] : steps[0].id;
  peopleRenderStepper(root, person, stepId);
}

function peopleRenderList(root) {
  const people = uiState.profile.people;
  const active = uiActivePerson();
  root.innerHTML = `
    <div class="row between"><h1>People</h1><a class="btn primary" href="#/people/new">Add a person</a></div>
    <p class="muted">Each person has their own conditions, allergens, numbers, and week. Only the active person's plan is shown on the other screens.</p>
    ${people.length ? people.map(p => `
      <div class="card">
        <div class="row between">
          <div class="person-row"><span class="avatar" aria-hidden="true">${uiEsc(p.name.slice(0, 1).toUpperCase())}</span>
            <div><div class="name">${uiEsc(p.name)} ${active && active.id === p.id ? '<span class="badge blue">active</span>' : ''}</div>
            <div class="small muted">${(p.modules || []).length} module${(p.modules || []).length === 1 ? '' : 's'}, ${(p.allergens || []).length} allergen${(p.allergens || []).length === 1 ? '' : 's'}${p.adult === false ? ', caregiver mode' : ''}</div></div>
          </div>
          <div class="row">
            ${active && active.id === p.id ? '' : `<button class="btn small" type="button" data-activate="${uiEsc(p.id)}">Set active</button>`}
            <a class="btn small" href="#/people/${uiEsc(p.id)}">Edit</a>
            <button class="btn small danger" type="button" data-delete="${uiEsc(p.id)}">Delete</button>
          </div>
        </div>
      </div>`).join('') : '<p class="empty">No people yet. Add the first person to build a plan.</p>'}
  `;
  root.querySelectorAll('[data-activate]').forEach(b => b.addEventListener('click', () => { uiSetActive(b.dataset.activate); uiToast('Active person changed.'); uiState.rerender(); }));
  root.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => {
    const p = uiFindPersonById(b.dataset.delete);
    if (!p) return;
    if (!window.confirm(`Delete ${p.name} and their log entries? This cannot be undone.`)) return;
    uiState.profile.people = uiState.profile.people.filter(x => x.id !== p.id);
    uiState.profile.log = (uiState.profile.log || []).filter(e => e.person !== p.id);
    if (uiState.profile.activePerson === p.id) uiState.profile.activePerson = uiState.profile.people[0] ? uiState.profile.people[0].id : null;
    uiPersist();
    uiToast('Deleted.');
    if (!uiState.profile.people.length) uiNavigate('#/people/new'); else uiState.rerender();
  }));
}

function peopleRenderNew(root) {
  const first = !uiState.profile.people.length;
  root.innerHTML = `
    <h1>${first ? 'Welcome' : 'Add a person'}</h1>
    ${first ? '<p>This app keeps everything on this device. Start by adding the first person. You can add family members later, each with their own plan.</p>' : ''}
    <div class="card">
      <form id="people-new-form">
        <div class="field"><label for="people-new-name">Name</label><input id="people-new-name" type="text" autocomplete="off" required maxlength="40"></div>
        <div class="btn-row"><button class="btn primary" type="submit">Continue</button>${first ? '' : '<a class="btn" href="#/people">Cancel</a>'}</div>
      </form>
    </div>`;
  const form = root.querySelector('#people-new-form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = root.querySelector('#people-new-name').value.trim();
    if (!name) return;
    const p = newPerson(name);
    uiState.profile.people.push(p);
    if (!uiState.profile.activePerson) uiState.profile.activePerson = p.id;
    uiPersist();
    peopleScreenAnswered = new Set();
    uiNavigate(`#/people/${p.id}/basics`);
  });
  root.querySelector('#people-new-name').focus();
}

function peopleRenderStepper(root, person, stepId) {
  const steps = peopleStepsFor(person);
  const idx = steps.findIndex(s => s.id === stepId);
  root.innerHTML = `
    <div class="row between"><h1>${uiEsc(person.name)}</h1><a class="btn small" href="#/people">All people</a></div>
    <div class="stepper" role="list" aria-label="Steps">
      ${steps.map((s, i) => `<button type="button" role="listitem" data-step="${s.id}" ${s.id === stepId ? 'aria-current="step"' : ''} class="${i < idx ? 'done' : ''}">${i + 1}. ${s.label}</button>`).join('')}
    </div>
    <div id="people-step"></div>
    <div class="btn-row">
      ${idx > 0 ? `<button class="btn" type="button" data-step="${steps[idx - 1].id}">Back</button>` : ''}
      ${idx < steps.length - 1 ? `<button class="btn primary" type="button" data-step="${steps[idx + 1].id}">Next: ${steps[idx + 1].label}</button>` : ''}
    </div>`;
  root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => uiNavigate(`#/people/${person.id}/${b.dataset.step}`)));
  peopleRenderStep(root.querySelector('#people-step'), person, stepId);
}

function peopleRefresh(container, person, stepId, focusSel) {
  uiPersist();
  peopleRenderStep(container, person, stepId);
  if (focusSel) { const el = container.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
}

function peopleRenderStep(container, person, stepId) {
  switch (stepId) {
    case 'basics': return peopleStepBasics(container, person);
    case 'conditions': return peopleStepConditions(container, person);
    case 'allergens': return peopleStepAllergens(container, person);
    case 'preferences': return peopleStepPreferences(container, person);
    case 'medications': return peopleStepMedications(container, person);
    case 'clinician': return peopleStepClinician(container, person);
    case 'screening': return peopleStepScreening(container, person);
    case 'cooking': return peopleStepCooking(container, person);
    case 'review': return peopleStepReview(container, person);
  }
}

function peopleBindSeg(container, person, stepId, name, apply, opts = {}) {
  container.querySelectorAll(`input[data-seg="${name}"]`).forEach(inp => inp.addEventListener('change', () => {
    apply(inp.value);
    if (opts.rerender === false) { uiPersist(); container.querySelectorAll(`input[data-seg="${name}"]`).forEach(i => i.closest('label').classList.toggle('on', i.checked)); }
    else peopleRefresh(container, person, stepId, `input[data-seg="${name}"][value="${inp.value}"]`);
  }));
}
function peopleBindMulti(container, person, stepId, name, apply, opts = {}) {
  container.querySelectorAll(`input[data-multi="${name}"]`).forEach(inp => inp.addEventListener('change', () => {
    apply(inp.value, inp.checked);
    if (opts.rerender === false) { uiPersist(); inp.closest('label').classList.toggle('on', inp.checked); }
    else peopleRefresh(container, person, stepId, `input[data-multi="${name}"][value="${inp.value}"]`);
  }));
}

// a) Basics
function peopleStepBasics(container, person) {
  container.innerHTML = `
    <div class="card">
      <div class="field"><label for="pb-name">Name</label><input id="pb-name" type="text" value="${uiEsc(person.name)}" maxlength="40"></div>
      <div class="field"><span class="label">Is this person an adult (18 or older)?</span>${uiYesNo('adult', person.adult !== false)}
        ${person.adult === false ? `<div class="notice block" style="margin-top:.5rem"><div class="notice-head">Stop</div><div>This app is for adults. A caregiver may use it to manage a child's confirmed celiac disease or diagnosed food allergies only. The other steps are turned off for this profile.</div></div>` : ''}
      </div>
      <div class="field"><span class="label">Sex</span>${uiSegmented('sex', [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'other', label: 'Other or prefer not to say' }], person.sex || '')}
        <div class="hint">Used only where a rule differs by sex.</div></div>
      <div class="grid-2">
        <div class="field"><label for="pb-age">Age (years)</label><input id="pb-age" type="number" inputmode="numeric" min="0" max="120" value="${person.age ?? ''}"></div>
        <div class="field"><label for="pb-weight">Weight (kg), optional</label><input id="pb-weight" type="number" inputmode="decimal" min="1" max="400" step="0.1" value="${person.weight_kg ?? ''}">
          <div class="hint">Some rules are written per kilogram of body weight (for example protein in kidney disease). Without a weight those rules are shown but not turned into a daily number.</div></div>
      </div>
      ${person.adult === false ? '' : `
      <div class="field"><span class="label">Pregnant?</span>${uiYesNo('pregnancy', !!person.pregnancy)}</div>
      <div class="field"><span class="label">Breastfeeding?</span>${uiYesNo('breastfeeding', !!person.breastfeeding)}
        <div class="hint">Either answer turns on the pregnancy and breastfeeding rules and turns off weight-loss, ketogenic, low-carbohydrate, fasting, and elimination protocols other than allergen and celiac.</div></div>`}
    </div>`;
  const bindText = (sel, fn) => container.querySelector(sel).addEventListener('change', e => { fn(e.target.value); uiPersist(); });
  bindText('#pb-name', v => { if (v.trim()) person.name = v.trim(); });
  bindText('#pb-age', v => { person.age = v === '' ? null : Number(v); });
  bindText('#pb-weight', v => { person.weight_kg = v === '' ? null : Number(v); });
  peopleBindSeg(container, person, 'basics', 'adult', v => {
    person.adult = v === 'yes';
    if (!person.adult) {
      person.modules = (person.modules || []).filter(id => { const m = uiState.conditionsById.get(id); return m && peopleIsCaregiverModule(m); });
      person.pregnancy = false; person.breastfeeding = false;
    }
  });
  peopleBindSeg(container, person, 'basics', 'sex', v => { person.sex = v; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'pregnancy', v => { person.pregnancy = v === 'yes'; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'breastfeeding', v => { person.breastfeeding = v === 'yes'; }, { rerender: false });
}

// b) Conditions and patterns
function peopleStepConditions(container, person) {
  let modules = uiState.data.conditions.slice();
  if (person.adult === false) modules = modules.filter(peopleIsCaregiverModule);
  const groups = [
    { key: 'condition', title: 'Medical conditions' },
    { key: 'pattern', title: 'Eating patterns' },
    { key: 'restriction', title: 'Restrictions' }
  ];
  const auto = { 'food-allergies': 'Turned on automatically when you list an allergen.', 'eating-disorder-screen': 'Turned on automatically by the screening step.', 'pregnancy-gdm-breastfeeding': 'Also turned on automatically by the pregnancy or breastfeeding answer.', 'medical-avoidances': 'Describes how condition-driven avoidances work. Selecting it adds no numbers.', 'preference-avoidances': 'Describes how preferences work. Your actual preferences are set on the Preferences step.', pediatric: 'Applies to a child profile (caregiver mode).' };
  if (person.adult !== false) modules = modules.filter(m => m.id !== 'pediatric');
  const selected = new Set(person.modules || []);
  const cats = new Set(modules.map(m => m.category));
  for (const c of cats) if (!groups.some(g => g.key === c)) groups.push({ key: c, title: c.charAt(0).toUpperCase() + c.slice(1) });
  container.innerHTML = `
    <p>Select everything that applies. The plan merges the rules and shows every conflict rather than picking a side. Tap a name to read what the evidence shows.</p>
    ${modules.length ? '' : '<p class="empty">No condition modules are loaded (data/conditions.json is missing or empty).</p>'}
    ${groups.map(g => {
      const list = modules.filter(m => m.category === g.key);
      if (!list.length) return '';
      return `<h2>${g.title}</h2><div class="choice-list">${list.map(m => {
        const locked = m.id === 'food-allergies' || m.id === 'eating-disorder-screen';
        return `<label class="choice" ${locked ? 'aria-disabled="true"' : ''}>
          <input type="checkbox" data-module="${uiEsc(m.id)}" ${selected.has(m.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
          <span class="choice-body">
            <span class="row"><button type="button" class="btn link" style="min-height:auto;padding:0;font-weight:700" data-edu="${uiEsc(m.id)}">${uiEsc(m.name)}</button> ${uiRatingBadge(m.evidence && m.evidence.rating)}</span>
            <span class="small muted">${uiEsc(m.evidence && m.evidence.summary || '')}</span>
            ${auto[m.id] ? `<span class="small muted"><br>${auto[m.id]}</span>` : ''}
          </span></label>`;
      }).join('')}</div>`;
    }).join('')}`;
  container.querySelectorAll('[data-module]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.module;
    person.modules = person.modules || [];
    if (inp.checked && !person.modules.includes(id)) person.modules.push(id);
    if (!inp.checked) person.modules = person.modules.filter(x => x !== id);
    uiPersist();
  }));
  container.querySelectorAll('[data-edu]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const m = uiState.conditionsById.get(b.dataset.edu);
    if (m) uiModal(learnModuleHTML(m), { title: m.name, label: 'About ' + m.name });
  }));
}

// c) Allergens
function peopleStepAllergens(container, person) {
  const sel = new Set(person.allergens || []);
  const strict = !!(person.preferences && person.preferences.may_contain_strict);
  container.innerHTML = `
    <div class="notice block"><div class="notice-head">Stop</div><div>Allergens are hard exclusions. Nothing in this app overrides them: not a preference, not a mode, not an acknowledgment. When an ingredient is not recognized, the app says so and does not assume it is safe.</div></div>
    <p>Confirmed food allergies (the nine FDA major allergens):</p>
    <div class="choice-list">
      ${UI_ALLERGENS.map(a => `<label class="choice"><input type="checkbox" data-allergen="${a.tag}" ${sel.has(a.tag) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${a.label}</span></span></label>`).join('')}
    </div>
    <div class="card" style="margin-top:1rem">
      <label class="choice" style="border:0;padding:0"><input type="checkbox" id="pa-strict" ${strict ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Treat "may contain" and shared-facility statements as a stop</span><span class="small muted">Many people with allergies avoid these. The evidence on actual risk is mixed, so this is your call. When on, terms like "may contain" and "processed in a facility" trigger a caution even without a named allergen.</span></span></label>
    </div>`;
  container.querySelectorAll('[data-allergen]').forEach(inp => inp.addEventListener('change', () => {
    person.allergens = person.allergens || [];
    const t = inp.dataset.allergen;
    if (inp.checked && !person.allergens.includes(t)) person.allergens.push(t);
    if (!inp.checked) person.allergens = person.allergens.filter(x => x !== t);
    uiPersist();
  }));
  container.querySelector('#pa-strict').addEventListener('change', e => {
    person.preferences = person.preferences || { avoid_tags: [], avoid_terms: [], patterns: [] };
    person.preferences.may_contain_strict = e.target.checked;
    uiPersist();
  });
}

// d) Preferences
function peopleStepPreferences(container, person) {
  person.preferences = person.preferences || { avoid_tags: [], avoid_terms: [], patterns: [] };
  const prefs = person.preferences;
  prefs.avoid_tags = prefs.avoid_tags || []; prefs.avoid_terms = prefs.avoid_terms || []; prefs.patterns = prefs.patterns || [];
  const dictTags = uiState.data.dictionaries.tags || {};
  const hasDict = Object.keys(dictTags).length > 0;
  const options = PEOPLE_SOFT_AVOID_OPTIONS.filter(o => !hasDict || dictTags[o.value]).map(o => ({ value: o.value, label: hasDict && dictTags[o.value] && dictTags[o.value].label && !/preference/.test(o.label) ? dictTags[o.value].label : o.label }));
  for (const t of prefs.avoid_tags) if (!options.some(o => o.value === t)) options.push({ value: t, label: uiTagLabel(t) });
  const porkTag = peopleFindPorkTag();
  const hasVegModule = uiState.conditionsById.has('vegetarian-vegan');
  container.innerHTML = `
    <p>Preferences are soft. They lower a recipe's score and show as a caution, and you can override them any time. They never loosen an allergen or a condition rule.</p>
    <h2>Pre-built patterns</h2>
    <div class="choice-list">
      ${[['vegetarian', 'Vegetarian', 'Avoids red meat, poultry, fish, and processed meat' + (hasVegModule ? '; turns on the vegetarian and vegan module' : '') + '.'],
        ['vegan', 'Vegan', 'Vegetarian plus eggs and dairy as preferences (not allergies)' + (hasVegModule ? '; turns on the vegetarian and vegan module' : '') + '.'],
        ['halal', 'Halal', porkTag ? `Avoids pork (tag: ${uiEsc(uiTagLabel(porkTag))}).` : 'No pork tag exists in the dictionary, so pork rules are applied by name matching on ingredient text (pork, bacon, ham, lard, gelatin).'],
        ['kosher', 'Kosher', porkTag ? `Avoids pork (tag: ${uiEsc(uiTagLabel(porkTag))}) and shellfish by name matching.` : 'No pork tag exists in the dictionary, so pork and shellfish rules are applied by name matching on ingredient text.']]
        .map(([id, label, hint]) => `<label class="choice"><input type="checkbox" data-pattern="${id}" ${prefs.patterns.includes(id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${label}</span><span class="small muted">${hint}</span></span></label>`).join('')}
    </div>
    <p class="small muted">Halal and kosher rules beyond pork and shellfish (slaughter, certification, meat and dairy separation) are not something this app can check from ingredient text.</p>
    <h2>Foods to avoid (soft)</h2>
    ${uiMultiPills('avoid_tags', options, prefs.avoid_tags, { label: 'Soft avoid tags' })}
    <div class="field" style="margin-top:1rem"><label for="pp-terms">Words to avoid in ingredient text</label>
      <input id="pp-terms" type="text" value="${uiEsc(prefs.avoid_terms.join(', '))}" placeholder="cilantro, blue cheese" autocomplete="off">
      <div class="hint">Comma separated. Matched as plain text in ingredient lists and recipe names. Soft.</div></div>`;
  container.querySelectorAll('[data-pattern]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.pattern;
    if (inp.checked && !prefs.patterns.includes(id)) prefs.patterns.push(id);
    if (!inp.checked) prefs.patterns = prefs.patterns.filter(x => x !== id);
    peopleApplyPatterns(person);
    peopleRefresh(container, person, 'preferences', `[data-pattern="${id}"]`);
  }));
  peopleBindMulti(container, person, 'preferences', 'avoid_tags', (v, on) => {
    if (on && !prefs.avoid_tags.includes(v)) prefs.avoid_tags.push(v);
    if (!on) prefs.avoid_tags = prefs.avoid_tags.filter(x => x !== v);
  }, { rerender: false });
  container.querySelector('#pp-terms').addEventListener('change', e => {
    const manual = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
    prefs.avoid_terms = Array.from(new Set(manual));
    uiPersist();
  });
}

function peopleApplyPatterns(person) {
  const prefs = person.preferences;
  const porkTag = peopleFindPorkTag();
  const wantTags = new Set();
  const wantTerms = new Set();
  for (const p of prefs.patterns) {
    for (const t of PEOPLE_PATTERN_TAGS[p] || []) wantTags.add(t);
    if ((p === 'halal' || p === 'kosher')) {
      if (porkTag) wantTags.add(porkTag);
      for (const term of PEOPLE_PATTERN_TERMS[p] || []) if (!porkTag || !/^(pork|bacon|ham|lard|prosciutto|pancetta)$/.test(term)) wantTerms.add(term);
    }
  }
  // tags any pattern could have added, so we can remove the ones no longer wanted
  const allPatternTags = new Set([].concat(...Object.values(PEOPLE_PATTERN_TAGS), porkTag ? [porkTag] : []));
  const allPatternTerms = new Set([].concat(...Object.values(PEOPLE_PATTERN_TERMS)));
  prefs.avoid_tags = prefs.avoid_tags.filter(t => !allPatternTags.has(t) || wantTags.has(t));
  for (const t of wantTags) if (!prefs.avoid_tags.includes(t)) prefs.avoid_tags.push(t);
  prefs.avoid_terms = prefs.avoid_terms.filter(t => !allPatternTerms.has(t) || wantTerms.has(t));
  for (const t of wantTerms) if (!prefs.avoid_terms.includes(t)) prefs.avoid_terms.push(t);
  const veg = prefs.patterns.includes('vegetarian') || prefs.patterns.includes('vegan');
  person.modules = person.modules || [];
  if (uiState.conditionsById.has('vegetarian-vegan')) {
    if (veg && !person.modules.includes('vegetarian-vegan')) person.modules.push('vegetarian-vegan');
    if (!veg) person.modules = person.modules.filter(m => m !== 'vegetarian-vegan');
  }
}

// e) Medications
function peopleStepMedications(container, person) {
  const plan = uiPlanFor(person);
  const seen = new Map();
  for (const m of plan.modules) {
    const mod = uiState.conditionsById.get(m.id);
    for (const q of (mod && mod.medication_questions) || []) if (!seen.has(q.id)) seen.set(q.id, { ...q, moduleName: mod.name });
  }
  person.medications = person.medications || {};
  const qs = [...seen.values()];
  container.innerHTML = `
    <p>Some medications change the rules. Answer what applies; the plan will set aside any rule that a medication makes unsafe and say why.</p>
    ${qs.length ? qs.map(q => `<div class="card">
      <span class="label">${uiEsc(q.text)}</span>
      <div class="small muted" style="margin-bottom:.5rem">Asked by ${uiEsc(q.moduleName)}.</div>
      ${uiYesNo('med-' + q.id, person.medications[q.id] === true ? true : person.medications[q.id] === false ? false : null)}
    </div>`).join('') : '<p class="empty">No medication questions apply to the modules you selected.</p>'}`;
  for (const q of qs) peopleBindSeg(container, person, 'medications', 'med-' + q.id, v => { person.medications[q.id] = v === 'yes'; }, { rerender: false });
}

// f) Clinician numbers (Tier 2)
function peopleStepClinician(container, person) {
  const plan = uiPlanFor(person);
  person.tier2 = person.tier2 || {};
  const entries = new Map();
  const base = p => String(p).replace(/_(max|min|target|per_kg)$/, '');
  const covered = new Set();
  for (const t of plan.tier2.missing) { entries.set(t.param, { ...t }); covered.add(t.module + '|' + base(t.param)); }
  for (const a of plan.tier2.applied) {
    if (entries.has(a.param)) continue;
    const mod = uiState.conditionsById.get(a.module);
    const decl = ((mod && mod.tier2) || []).find(t => base(t.param) === base(a.param)) || {};
    entries.set(a.param, { param: a.param, module: a.module, moduleName: mod ? mod.name : a.module, label: decl.label || `${uiNutrientLabel(a.param)} (${/_max$/.test(a.param) ? 'upper limit' : 'target'})`, consensus: decl.consensus || '', why: decl.why || '' });
    covered.add(a.module + '|' + base(a.param));
  }
  // Module declarations that the engine has not turned into a parameter yet (for example, a rule that is not active in the current phase).
  for (const m of plan.modules) {
    const mod = uiState.conditionsById.get(m.id);
    for (const t of (mod && mod.tier2) || []) {
      if (entries.has(t.param) || covered.has(mod.id + '|' + base(t.param))) continue;
      entries.set(t.param, { ...t, module: mod.id, moduleName: mod.name, declaredOnly: true });
    }
  }
  const list = [...entries.values()];
  const applied = new Map(plan.tier2.applied.map(a => [a.param, a.value]));
  container.innerHTML = `
    <p>These numbers are Tier 2: the app knows the published range but does not choose a value for you. Until a number is entered, the module runs on its Tier 1 rules only and the plan says so.</p>
    ${list.length ? list.map(t => `<div class="card">
      <label for="pt-${uiEsc(t.param)}">${uiEsc(t.label || t.param)}</label>
      <div class="small muted">${uiEsc(t.moduleName || '')}${t.when ? ` (applies when: ${uiEsc(t.when)})` : ''}</div>
      ${t.consensus ? `<div class="small"><strong>Published range:</strong> ${uiEsc(t.consensus)}</div>` : ''}
      ${t.why ? `<div class="small muted">${uiEsc(t.why)}</div>` : ''}
      <div class="row" style="margin-top:.5rem">
        <input id="pt-${uiEsc(t.param)}" type="number" inputmode="decimal" step="any" style="max-width:220px" data-tier2="${uiEsc(t.param)}" value="${typeof person.tier2[t.param] === 'number' ? person.tier2[t.param] : ''}" aria-describedby="pt-help-${uiEsc(t.param)}">
        <span class="muted small">${uiEsc(peopleUnitFor(t.param))}</span>
        ${applied.has(t.param) ? '<span class="badge blue">clinician-set, applied</span>' : typeof person.tier2[t.param] === 'number' ? '<span class="badge gray">saved, not currently used</span>' : t.declaredOnly ? '<span class="badge gray">not needed right now</span>' : '<span class="badge amber">not applied</span>'}
      </div>
      <p id="pt-help-${uiEsc(t.param)}" class="small" style="margin:.5rem 0 0"><strong>Enter the number your clinician gave you. The app does not set this.</strong></p>
    </div>`).join('') : '<p class="empty">No clinician-set numbers are needed for the modules you selected.</p>'}`;
  container.querySelectorAll('[data-tier2]').forEach(inp => inp.addEventListener('change', () => {
    const v = inp.value.trim();
    if (v === '') delete person.tier2[inp.dataset.tier2]; else person.tier2[inp.dataset.tier2] = Number(v);
    peopleRefresh(container, person, 'clinician', `[data-tier2="${inp.dataset.tier2}"]`);
  }));
}
function peopleUnitFor(param) {
  const m = /_(mg|g|ug|iu|ml|kcal)_(max|min)$/.exec(param) || /_(mg|g|ug|iu|ml)$/.exec(param);
  if (!m) return param === 'kcal_max' || param === 'kcal_min' ? 'kcal per day' : '';
  return { mg: 'mg per day', g: 'g per day', ug: 'mcg per day', iu: 'IU per day', ml: 'mL per day', kcal: 'kcal per day' }[m[1]] || '';
}

// g) Screening (SCOFF)
function peopleStepScreening(container, person) {
  person.screen = person.screen || { scoff: [false, false, false, false, false], positive: false, completed_at: null };
  const s = person.screen;
  const answered = i => s.completed_at ? true : (s.scoff[i] === true || peopleScreenAnswered.has(person.id + ':' + i));
  const res = scoreScoff(s.scoff);
  container.innerHTML = `
    <p>Five quick questions before any weight-focused or restrictive feature turns on. This is the same step a dietitian would take.</p>
    <p class="small muted">Placeholder wording (SCOFF). Mary will finalize the language.</p>
    ${SCOFF_ITEMS.map((it, i) => `<div class="card tight"><span class="label">${uiEsc(it.text)}</span>${uiYesNo('scoff-' + i, answered(i) ? !!s.scoff[i] : null)}</div>`).join('')}
    ${s.completed_at ? `<p class="small muted">Completed ${uiEsc(s.completed_at.slice(0, 10))}. ${res.yes} of 5 answered yes.</p>` : '<p class="small muted">Answer all five to complete the screen.</p>'}
    ${s.positive ? `<div class="notice warn"><div class="notice-head">${uiEsc(SUPPORT_TEXT.heading)}</div><div>${uiEsc(SUPPORT_TEXT.plain)}</div>
      <ul style="margin-top:.5rem">${SUPPORT_TEXT.referral.map(r => `<li><strong>${uiEsc(r.name)}</strong>: ${uiEsc(r.detail)}${r.verify ? ` <span class="badge amber">verify</span> <span class="small muted">${uiEsc(r.verify)}</span>` : ''}</li>`).join('')}</ul></div>` : ''}`;
  SCOFF_ITEMS.forEach((it, i) => peopleBindSeg(container, person, 'screening', 'scoff-' + i, v => {
    s.scoff[i] = v === 'yes';
    peopleScreenAnswered.add(person.id + ':' + i);
    const all = SCOFF_ITEMS.every((_, j) => answered(j));
    const r = scoreScoff(s.scoff);
    s.positive = r.positive;
    if (all && !s.completed_at) s.completed_at = new Date().toISOString();
    else if (all) s.completed_at = new Date().toISOString();
  }));
}

// h) Cooking
function peopleStepCooking(container, person) {
  person.cooking = person.cooking || {};
  const c = person.cooking;
  const buckets = [{ value: 8, label: 'Under 10 min' }, { value: 15, label: '10 to 20' }, { value: 30, label: '20 to 40' }, { value: 50, label: '40 or more' }];
  const days = [['sun', 'Sun'], ['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat']].map(([value, label]) => ({ value, label }));
  container.innerHTML = `
    <p>Meals are chosen to fit the time you actually have. Time and interest are soft; the medical rules and allergens are not.</p>
    <div class="card">
      <div class="field"><span class="label">Weekday time per meal</span>${uiSegmented('weekday_minutes', buckets, uiMinutesBucket(c.weekday_minutes))}</div>
      <div class="field"><span class="label">Weekend time per meal</span>${uiSegmented('weekend_minutes', buckets, uiMinutesBucket(c.weekend_minutes))}</div>
      <div class="field"><span class="label">Days you can cook</span>${uiMultiPills('cook_days', days, c.cook_days || [], { label: 'Days you can cook' })}<div class="hint">On other days the plan uses leftovers or assembly meals.</div></div>
      <div class="field"><span class="label">Interest in cooking</span>${uiSegmented('interest', [{ value: 'learn', label: 'I want to cook and learn' }, { value: 'simple', label: "I'll cook if it's simple" }, { value: 'minimal', label: 'Minimal cooking' }, { value: 'assembly', label: 'Assembly only, no stove' }], c.interest || 'simple')}</div>
      <div class="field"><span class="label">Skill</span>${uiSegmented('skill', [{ value: 'beginner', label: 'Beginner' }, { value: 'comfortable', label: 'Comfortable' }, { value: 'confident', label: 'Confident' }], c.skill || 'comfortable')}</div>
      <div class="field"><span class="label">Equipment</span>${uiMultiPills('equipment', [{ value: 'stove', label: 'Stove' }, { value: 'oven', label: 'Oven' }, { value: 'microwave', label: 'Microwave' }, { value: 'air-fryer', label: 'Air fryer' }, { value: 'slow-cooker', label: 'Slow cooker' }, { value: 'pressure-cooker', label: 'Pressure cooker' }, { value: 'blender', label: 'Blender' }, { value: 'none', label: 'No kitchen' }], c.equipment || [], { label: 'Equipment' })}</div>
      <div class="field"><span class="label">Leftovers</span>${uiSegmented('leftovers', [{ value: 'good', label: 'Same meal three days running is fine' }, { value: 'ok', label: 'Somewhere between' }, { value: 'poor', label: 'Variety every meal' }], c.leftovers || 'ok')}</div>
      <div class="grid-2">
        <div class="field"><label for="pc-household">Household size (people eating)</label><input id="pc-household" type="number" inputmode="numeric" min="1" max="12" value="${c.household || 1}"></div>
        <div class="field"><span class="label">Grocery access</span>${uiSegmented('grocery', [{ value: 'supermarket', label: 'Full supermarket' }, { value: 'limited', label: 'Limited store' }, { value: 'delivery', label: 'Delivery only' }, { value: 'constrained', label: 'Dollar store or food bank' }], c.grocery || 'supermarket')}</div>
      </div>
    </div>`;
  const seg = (name, fn) => peopleBindSeg(container, person, 'cooking', name, fn, { rerender: false });
  seg('weekday_minutes', v => { c.weekday_minutes = Number(v); });
  seg('weekend_minutes', v => { c.weekend_minutes = Number(v); });
  seg('interest', v => { c.interest = v; });
  seg('skill', v => { c.skill = v; });
  seg('leftovers', v => { c.leftovers = v; });
  seg('grocery', v => { c.grocery = v; });
  peopleBindMulti(container, person, 'cooking', 'cook_days', (v, on) => { c.cook_days = c.cook_days || []; if (on && !c.cook_days.includes(v)) c.cook_days.push(v); if (!on) c.cook_days = c.cook_days.filter(x => x !== v); }, { rerender: false });
  peopleBindMulti(container, person, 'cooking', 'equipment', (v, on) => { c.equipment = c.equipment || []; if (on && !c.equipment.includes(v)) c.equipment.push(v); if (!on) c.equipment = c.equipment.filter(x => x !== v); }, { rerender: false });
  container.querySelector('#pc-household').addEventListener('change', e => { c.household = Math.max(1, Number(e.target.value) || 1); uiPersist(); });
}

// i) Review
function peopleStepReview(container, person) {
  const plan = uiPlanFor(person);
  const prefs = person.preferences || {};
  const c = person.cooking || {};
  const kv = [
    ['Adult', person.adult === false ? 'No (caregiver mode)' : 'Yes'],
    ['Sex, age', `${person.sex || 'not set'}${person.age ? ', ' + person.age : ''}`],
    ['Weight', person.weight_kg ? person.weight_kg + ' kg' : 'not entered'],
    ['Pregnant or breastfeeding', person.pregnancy || person.breastfeeding ? 'Yes' : 'No'],
    ['Modules', plan.modules.length ? plan.modules.map(m => m.name).join(', ') : 'none'],
    ['Turned off', plan.disabledModules.length ? plan.disabledModules.map(d => `${uiEsc(uiModuleName(d.id))} (by ${uiEsc(uiModuleName(d.by))})`).join(', ') : 'none'],
    ['Allergens', (person.allergens || []).length ? person.allergens.map(t => UI_ALLERGENS.find(a => a.tag === t)?.label || t).join(', ') : 'none'],
    ['Patterns', (prefs.patterns || []).join(', ') || 'none'],
    ['Soft avoid', (prefs.avoid_tags || []).map(uiTagLabel).join(', ') || 'none'],
    ['Avoid words', (prefs.avoid_terms || []).join(', ') || 'none'],
    ['Medications', Object.entries(person.medications || {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'none flagged'],
    ['Clinician numbers', Object.keys(person.tier2 || {}).length ? Object.entries(person.tier2).map(([k, v]) => `${k}: ${v}`).join(', ') : 'none entered'],
    ['Screening', person.screen && person.screen.completed_at ? (person.screen.positive ? 'Completed, positive' : 'Completed, negative') : 'Not completed'],
    ['Cooking', `${c.weekday_minutes || 20} min weekdays, ${c.weekend_minutes || 40} min weekends, ${(c.cook_days || []).length} cook days, ${c.interest || 'simple'}, ${c.skill || 'comfortable'}, household ${c.household || 1}`]
  ];
  container.innerHTML = `
    <div class="card"><dl class="kv">${kv.map(([k, v]) => `<dt>${uiEsc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${plan.notices.filter(n => n.level !== 'info').length ? `<h2>The plan will show these notices</h2>${plan.notices.filter(n => n.level !== 'info').map(n => `<div class="notice ${n.level}"><div class="notice-head">${n.level === 'block' ? 'Stop' : 'Caution'}</div><div>${uiEsc(n.text)}</div></div>`).join('')}` : ''}
    <div class="btn-row"><button class="btn primary" type="button" id="pr-save">Save and open the plan</button></div>`;
  container.querySelector('#pr-save').addEventListener('click', () => {
    uiSetActive(person.id);
    uiToast('Saved.');
    uiNavigate('#/plan');
  });
}
