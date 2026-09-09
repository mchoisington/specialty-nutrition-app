// People and onboarding stepper. Every change is written to the profile and saved immediately.
// Weight and height are entered in pounds and feet/inches and stored in kilograms and centimetres.
import { newPerson } from '../store.js';
import { lbToKg, kgToLb, ftInToCm, cmToFtIn, ACTIVITY_LEVELS } from '../engine/energy.js';
import { uiState, uiEsc, uiPersist, uiActivePerson, uiSetActive, uiPlanFor, uiRatingBadge, uiSegmented, uiMultiPills, uiYesNo, uiNavigate, uiToast, uiModal, uiFindPersonById, UI_ALLERGENS, uiTagLabel, uiModuleName, uiNutrientLabel, uiEnsurePerson, uiParamUnit, uiBigChoices, uiBigToggles, uiEnsureUserDefinedSource, uiUserDefinedBadge, uiWeightHeightText } from './common.js';
import { learnArticleHTML } from './learn.js';

const PEOPLE_STEPS = [
  { id: 'basics', label: 'Basics' },
  { id: 'conditions', label: 'Conditions' },
  { id: 'allergens', label: 'Allergens' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'medications', label: 'Medications' },
  { id: 'clinician', label: 'Clinician numbers' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'review', label: 'Review' }
];
const PEOPLE_CAREGIVER_STEPS = ['basics', 'conditions', 'allergens', 'cooking', 'review'];
const PEOPLE_COOKING_SUBS = [
  { id: 'time', label: 'Time' },
  { id: 'days', label: 'Days and interest' },
  { id: 'kitchen', label: 'Kitchen' }
];

// Vegetarian, vegan, and pescatarian come from the engine (vegetarian-vegan module variants). Halal and kosher have no module.
const PEOPLE_VEG_PATTERNS = ['vegetarian', 'vegan', 'pescatarian'];
const PEOPLE_MULTI_VARIANT_MODULES = ['pregnancy-gdm-breastfeeding'];
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

// Custom diet builder: tag families a person may pick from, and a fallback list when the dictionary carries no family field.
const PEOPLE_CUSTOM_FAMILIES = ['pattern', 'allergen', 'dairy', 'sugar', 'gluten', 'soy'];
const PEOPLE_PATTERN_TAG_FALLBACK = ['vegetable', 'fruit', 'whole-grain', 'refined-grain', 'legume', 'nut', 'seed', 'fish', 'poultry', 'red-meat', 'processed-meat', 'low-fat-dairy', 'full-fat-dairy', 'olive-oil', 'ultra-processed', 'fried', 'high-fiber-insoluble', 'small-particle-friendly', 'fermented-live-culture'];
const PEOPLE_CUSTOM_LIMITS = [
  { key: 'sodium_mg', label: 'Sodium', unit: 'mg a day' },
  { key: 'added_sugar_g', label: 'Added sugar', unit: 'g a day' },
  { key: 'satfat_g', label: 'Saturated fat', unit: 'g a day' },
  { key: 'carb_g', label: 'Carbohydrate', unit: 'g a day' }
];

const PEOPLE_TIME_OPTIONS = [
  { value: 10, label: '10 minutes or less' },
  { value: 15, label: 'About 15 minutes' },
  { value: 30, label: 'About 30 minutes' },
  { value: 45, label: '45 minutes or more' }
];
const PEOPLE_DAYS = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']].map(([value, label]) => ({ value, label }));
const PEOPLE_INTEREST_OPTIONS = [
  { value: 'learn', label: 'I like cooking and want to learn', desc: 'Recipes with a few more steps are welcome.' },
  { value: 'simple', label: "I'll cook if it's simple", desc: 'Short recipes with everyday ingredients.' },
  { value: 'minimal', label: 'As little cooking as possible', desc: 'Quick meals, leftovers, and very few steps.' },
  { value: 'assembly', label: 'No cooking: just putting things together', desc: 'Nothing that needs a stove or oven.' }
];
const PEOPLE_LEFTOVER_OPTIONS = [
  { value: 'good', label: 'Happy with leftovers', desc: 'The same meal a few days running is fine.' },
  { value: 'ok', label: 'Some repeats are fine', desc: 'A mix of new meals and leftovers.' },
  { value: 'poor', label: 'Something different every meal', desc: 'As little repetition as possible.' }
];
const PEOPLE_SHOP_OPTIONS = [
  { value: 'supermarket', label: 'A full supermarket', desc: 'Most ingredients are easy to find.' },
  { value: 'limited', label: 'A small or limited store', desc: 'Fewer choices; plain ingredients work best.' },
  { value: 'delivery', label: 'Delivery only', desc: 'Groceries are ordered, not picked out.' },
  { value: 'constrained', label: 'Dollar store or food bank', desc: 'The plan leans on shelf-stable basics.' }
];
const PEOPLE_ICON = {
  stove: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="2"/><circle cx="15.5" cy="9" r="2"/><path d="M6 16h12"/></svg>',
  oven: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18"/><rect x="6" y="11" width="12" height="7" rx="1"/><path d="M7 5.5h.01M10 5.5h.01"/></svg>',
  microwave: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><rect x="5" y="8" width="10" height="8" rx="1"/><path d="M18 9v.01M18 13v.01"/></svg>',
  'air-fryer': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h12l1 6H5z"/><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M9 15h6"/></svg>',
  'slow-cooker': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h16v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M6 9V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M2 12h2M20 12h2"/></svg>',
  'pressure-cooker': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M4 10h16M12 10V6M9 6h6"/><path d="M2 14h3M19 14h3"/></svg>',
  blender: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l-1 11H9z"/><path d="M7 14h10v3H7z"/><path d="M9 17v4h6v-4"/></svg>',
  none: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 11h14M9 7v1M9 14v1"/></svg>'
};
const PEOPLE_EQUIPMENT = [
  { value: 'stove', label: 'Stove' }, { value: 'oven', label: 'Oven' }, { value: 'microwave', label: 'Microwave' }, { value: 'air-fryer', label: 'Air fryer' },
  { value: 'slow-cooker', label: 'Slow cooker' }, { value: 'pressure-cooker', label: 'Pressure cooker' }, { value: 'blender', label: 'Blender' }, { value: 'none', label: 'No kitchen, just a fridge' }
].map(o => ({ ...o, icon: PEOPLE_ICON[o.value] }));

let peopleCustomDraft = null;

function peopleStepsFor(person) {
  return person.adult === false ? PEOPLE_STEPS.filter(s => PEOPLE_CAREGIVER_STEPS.includes(s.id)) : PEOPLE_STEPS;
}

// Flat list of pages in walk-through order. Cooking is one step with three sub-screens.
function peoplePagesFor(person) {
  const pages = [];
  for (const s of peopleStepsFor(person)) {
    if (s.id === 'cooking') for (const c of PEOPLE_COOKING_SUBS) pages.push({ step: 'cooking', sub: c.id, hash: `cooking/${c.id}`, label: `Cooking: ${c.label}` });
    else pages.push({ step: s.id, sub: null, hash: s.id, label: s.label });
  }
  return pages;
}

function peopleIsCaregiverModule(m) {
  return /celiac/.test(m.id) || m.id === 'food-allergies' || m.id === 'pediatric';
}

function peopleFindPorkTag() {
  const tags = uiState.data.dictionaries.tags || {};
  return Object.keys(tags).find(t => /^pork$|(^|-)pork(-|$)/.test(t)) || null;
}

function peopleTimeBucket(min) {
  const m = Number(min) || 0;
  if (m <= 10) return 10;
  if (m <= 20) return 15;
  if (m <= 37) return 30;
  return 45;
}

function peopleAllergenLabel(tag) {
  const a = UI_ALLERGENS.find(x => x.tag === tag);
  return a ? a.label : uiTagLabel(tag);
}

export function renderPeopleScreen(root, ctx) {
  const parts = ctx.route.parts;
  if (!parts.length) return peopleRenderList(root);
  if (parts[0] === 'new') return peopleRenderNew(root);
  const person = uiEnsurePerson(uiFindPersonById(parts[0]));
  if (!person) { root.innerHTML = '<h1>People</h1><p class="empty">That person was not found.</p><a class="btn" href="#/people">Back to People</a>'; return; }
  const steps = peopleStepsFor(person);
  const stepId = steps.some(s => s.id === parts[1]) ? parts[1] : steps[0].id;
  const sub = stepId === 'cooking' ? (PEOPLE_COOKING_SUBS.some(c => c.id === parts[2]) ? parts[2] : 'time') : null;
  peopleRenderStepper(root, person, stepId, sub);
}

function peopleRenderList(root) {
  const people = uiState.profile.people;
  const active = uiActivePerson();
  root.innerHTML = `
    <div class="row between"><h1>People</h1><a class="btn primary" href="#/people/new">Add a person</a></div>
    <p class="muted">Each person has their own conditions, allergens, numbers, and week. Only the active person's plan is shown on the other screens.</p>
    ${people.length ? people.map(p => {
      const isActive = active && active.id === p.id;
      const mods = (p.modules || []).length + (p.custom_modules || []).length;
      const allergens = (p.allergens || []).map(peopleAllergenLabel);
      const summary = [`${mods} module${mods === 1 ? '' : 's'}`, allergens.length ? `allergens: ${allergens.join(', ')}` : 'no allergens', p.adult === false ? 'caregiver mode' : ''].filter(Boolean).join(', ');
      return `
      <div class="card person-card">
        <div class="person-row"><span class="avatar" aria-hidden="true">${uiEsc(p.name.slice(0, 1).toUpperCase())}</span>
          <div class="person-main"><div class="name">${uiEsc(p.name)} ${isActive ? '<span class="badge blue">active</span>' : ''}${p.setup_complete ? '' : ' <span class="badge amber">setup not finished</span>'}</div>
          <div class="small muted">${uiEsc(summary)}</div></div>
        </div>
        <div class="btn-row">
          ${isActive ? '<span class="btn small" aria-disabled="true" style="opacity:.6">Active now</span>' : `<button class="btn small" type="button" data-activate="${uiEsc(p.id)}">Set active</button>`}
          ${p.setup_complete ? '' : `<a class="btn small primary" href="#/people/${uiEsc(p.id)}/basics">Finish setup</a>`}
          <button class="btn small danger" type="button" data-delete="${uiEsc(p.id)}">Delete</button>
        </div>
        ${p.setup_complete ? `<div class="edit-row" role="group" aria-label="Edit ${uiEsc(p.name)}"><span class="small muted edit-label">Edit:</span>${peopleStepsFor(p).map(s => `<a class="btn small" href="#/people/${uiEsc(p.id)}/${s.id}${s.id === 'cooking' ? '/time' : ''}">${s.label}</a>`).join('')}</div>` : ''}
      </div>`;
    }).join('') : '<p class="empty">No people yet. Add the first person to build a plan.</p>'}
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
    const p = uiEnsurePerson(newPerson(name));
    uiState.profile.people.push(p);
    if (!uiState.profile.activePerson) uiState.profile.activePerson = p.id;
    uiPersist();
    peopleCustomDraft = null;
    uiNavigate(`#/people/${p.id}/basics`);
  });
  root.querySelector('#people-new-name').focus();
}

function peopleRenderStepper(root, person, stepId, sub) {
  const steps = peopleStepsFor(person);
  const pages = peoplePagesFor(person);
  const idx = steps.findIndex(s => s.id === stepId);
  const pageHash = stepId === 'cooking' ? `cooking/${sub}` : stepId;
  const pageIdx = pages.findIndex(p => p.hash === pageHash);
  const prev = pages[pageIdx - 1] || null;
  const next = pages[pageIdx + 1] || null;
  const done = !!person.setup_complete;
  root.innerHTML = `
    <div class="row between"><h1>${uiEsc(person.name)}</h1><a class="btn small" href="#/people">Back to People</a></div>
    ${done ? '' : '<p class="small muted">Setting up. Use Next to walk through each step; the plan is ready once you save on the Review step.</p>'}
    <div class="stepper" role="list" aria-label="Steps">
      ${steps.map((s, i) => {
        const clickable = done || i <= idx;
        return `<button type="button" role="listitem" data-step="${s.id}" ${s.id === stepId ? 'aria-current="step"' : ''} class="${i < idx ? 'done' : ''}" ${clickable ? '' : 'disabled aria-disabled="true"'}>${i + 1}. ${s.label}</button>`;
      }).join('')}
    </div>
    <div id="people-step"></div>
    <div class="btn-row people-actions">
      ${prev ? `<button class="btn" type="button" data-step="${prev.hash}">Back</button>` : ''}
      ${next ? `<button class="btn primary" type="button" data-step="${next.hash}">Next: ${uiEsc(next.label)}</button>` : ''}
      <button class="btn" type="button" id="people-save">Save</button>
      <a class="btn" href="#/people">Back to People</a>
    </div>`;
  root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => {
    const target = b.dataset.step === 'cooking' ? 'cooking/time' : b.dataset.step;
    uiNavigate(`#/people/${person.id}/${target}`);
  }));
  root.querySelector('#people-save').addEventListener('click', () => { uiPersist(); uiToast('Saved.'); });
  peopleRenderStep(root.querySelector('#people-step'), person, stepId, sub);
}

function peopleRefresh(container, person, stepId, focusSel, sub) {
  uiPersist();
  peopleRenderStep(container, person, stepId, sub || (stepId === 'cooking' ? container.dataset.sub : null));
  if (focusSel) { const el = container.querySelector(focusSel); if (el) el.focus({ preventScroll: true }); }
}

function peopleRenderStep(container, person, stepId, sub) {
  container.dataset.sub = sub || '';
  switch (stepId) {
    case 'basics': return peopleStepBasics(container, person);
    case 'conditions': return peopleStepConditions(container, person);
    case 'allergens': return peopleStepAllergens(container, person);
    case 'preferences': return peopleStepPreferences(container, person);
    case 'medications': return peopleStepMedications(container, person);
    case 'clinician': return peopleStepClinician(container, person);
    case 'cooking': return peopleStepCooking(container, person, sub || 'time');
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
  const lb = person.weight_kg > 0 ? kgToLb(person.weight_kg) : '';
  const hi = person.height_cm > 0 ? cmToFtIn(person.height_cm) : { ft: '', inch: '' };
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
        <div class="field"><label for="pb-weight">Weight (lb)</label><input id="pb-weight" type="number" inputmode="decimal" min="1" max="900" step="1" value="${lb}">
          <div class="hint">Optional. Some rules are written per kilogram of body weight (for example protein in kidney disease); the app converts for you. Without a weight those rules are shown but not turned into a daily number.</div></div>
        <div class="field"><span class="label" id="pb-height-label">Height (ft / in)</span>
          <div class="height-inputs" role="group" aria-labelledby="pb-height-label">
            <label class="visually-hidden" for="pb-ft">Feet</label><input id="pb-ft" type="number" inputmode="numeric" min="1" max="8" step="1" value="${hi.ft ?? ''}" placeholder="ft"><span class="unit">ft</span>
            <label class="visually-hidden" for="pb-in">Inches</label><input id="pb-in" type="number" inputmode="numeric" min="0" max="11" step="1" value="${hi.inch ?? ''}" placeholder="in"><span class="unit">in</span>
          </div>
          <div class="hint">Optional. With weight, this gives a body mass index for the few rules that apply only when a guideline ties advice to overweight, and a calorie estimate if you turn one on.</div></div>
      </div>
      <div class="field"><h3 class="big-sub">How active are you most weeks?</h3>
        ${uiBigChoices('activity', ACTIVITY_LEVELS.map(l => ({ value: l.id, label: l.label })), person.activity || 'light', { label: 'Activity level' })}
        <div class="hint">Used only for the calorie estimate, and only when you turn that on.</div></div>
      ${person.adult === false ? '' : `
      <div class="field"><span class="label">Pregnant?</span>${uiYesNo('pregnancy', !!person.pregnancy)}</div>
      <div class="field"><span class="label">Breastfeeding?</span>${uiYesNo('breastfeeding', !!person.breastfeeding)}
        <div class="hint">Either answer turns on the pregnancy and breastfeeding rules and turns off weight-loss, ketogenic, low-carbohydrate, fasting, and elimination protocols other than allergen and celiac.</div></div>`}
    </div>`;
  const bindText = (sel, fn) => container.querySelector(sel).addEventListener('change', e => { fn(e.target.value); uiPersist(); });
  bindText('#pb-name', v => { if (v.trim()) person.name = v.trim(); });
  bindText('#pb-age', v => { person.age = v === '' ? null : Number(v); });
  bindText('#pb-weight', v => { person.weight_kg = v === '' ? null : lbToKg(v); });
  const height = () => {
    const ft = container.querySelector('#pb-ft').value, inch = container.querySelector('#pb-in').value;
    person.height_cm = ft === '' && inch === '' ? null : ftInToCm(ft, inch);
  };
  bindText('#pb-ft', height);
  bindText('#pb-in', height);
  container.querySelectorAll('input[data-seg="adult"]').forEach(inp => inp.addEventListener('change', () => {
    person.adult = inp.value === 'yes';
    if (!person.adult) {
      person.modules = (person.modules || []).filter(id => { const m = uiState.conditionsById.get(id); return m && peopleIsCaregiverModule(m); });
      person.pregnancy = false; person.breastfeeding = false;
    }
    uiPersist();
    uiState.rerender(); // the step list changes with this answer
  }));
  peopleBindSeg(container, person, 'basics', 'sex', v => { person.sex = v; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'activity', v => { person.activity = v; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'pregnancy', v => { person.pregnancy = v === 'yes'; }, { rerender: false });
  peopleBindSeg(container, person, 'basics', 'breastfeeding', v => { person.breastfeeding = v === 'yes'; }, { rerender: false });
}

// b) Conditions and patterns, grouped by category: condition, pattern, restriction.
function peopleStepConditions(container, person) {
  let modules = uiState.data.conditions.slice();
  if (person.adult === false) modules = modules.filter(peopleIsCaregiverModule);
  const groups = [
    { key: 'condition', title: 'Medical conditions' },
    { key: 'pattern', title: 'Eating patterns' },
    { key: 'restriction', title: 'Restrictions' }
  ];
  const auto = { 'food-allergies': 'Turned on automatically when you list an allergen.', 'pregnancy-gdm-breastfeeding': 'Also turned on automatically by the pregnancy or breastfeeding answer.', 'medical-avoidances': 'Describes how condition-driven avoidances work. Selecting it adds no numbers.', 'preference-avoidances': 'Describes how preferences work. Your actual preferences are set on the Preferences step.', pediatric: 'Applies to a child profile (caregiver mode).' };
  if (person.adult !== false) modules = modules.filter(m => m.id !== 'pediatric');
  const selected = new Set(person.modules || []);
  const cats = new Set(modules.map(m => m.category));
  for (const c of cats) if (!groups.some(g => g.key === c)) groups.push({ key: c, title: c.charAt(0).toUpperCase() + c.slice(1) });
  container.innerHTML = `
    <p>Select everything that applies. The plan merges the rules and shows every conflict rather than picking a side. Tap a name to read about it before choosing.</p>
    ${modules.length ? '' : '<p class="empty">No condition modules are loaded (data/conditions.json is missing or empty).</p>'}
    ${groups.map(g => {
      const list = modules.filter(m => m.category === g.key);
      if (!list.length) return '';
      return `<h2>${g.title}</h2><div class="choice-list">${list.map(m => {
        const locked = m.id === 'food-allergies';
        return `<label class="choice" ${locked ? 'aria-disabled="true"' : ''}>
          <input type="checkbox" data-module="${uiEsc(m.id)}" ${selected.has(m.id) ? 'checked' : ''} ${locked ? 'disabled' : ''}>
          <span class="choice-body">
            <span class="row"><button type="button" class="btn link module-name" data-edu="${uiEsc(m.id)}" aria-label="Read about ${uiEsc(m.name)}">${uiEsc(m.name)}</button> ${uiRatingBadge(m.evidence && m.evidence.rating)}</span>
            <span class="small muted">${uiEsc(m.evidence && m.evidence.summary || '')}</span>
            ${auto[m.id] ? `<span class="small muted"><br>${auto[m.id]}</span>` : ''}
          </span></label>${selected.has(m.id) && !locked ? peopleModulePanelHTML(m, person) : ''}`;
      }).join('')}</div>`;
    }).join('')}
    ${peopleGlobalFlagsHTML(person)}`;
  container.querySelectorAll('[data-module]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.module;
    person.modules = person.modules || [];
    if (inp.checked && !person.modules.includes(id)) person.modules.push(id);
    if (!inp.checked) person.modules = person.modules.filter(x => x !== id);
    peopleRefresh(container, person, 'conditions', `[data-module="${id}"]`);
  }));
  peopleBindModulePanels(container, person, 'conditions');
  container.querySelectorAll('[data-edu]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    const m = uiState.conditionsById.get(b.dataset.edu);
    if (m) uiModal(`<div class="article-modal">${learnArticleHTML(m)}<p class="small"><a href="#/learn/${uiEsc(m.id)}">Open the full article on the Learn screen</a></p></div>`, { title: m.name, label: 'About ' + m.name });
  }));
}

// Per-module controls: variants, flags, optional rules, configurable rules, required confirmations.
function peopleModulePanelHTML(m, person) {
  const parts = [];
  const flags = uiState.conditionsMeta.flags || {};
  if (Array.isArray(m.variants) && m.variants.length) {
    const multi = PEOPLE_MULTI_VARIANT_MODULES.includes(m.id);
    const stored = person.variants[m.id];
    const chosen = Array.isArray(stored) ? stored : typeof stored === 'string' ? [stored] : [];
    const def = m.variants.find(v => v.default) || m.variants[0];
    const cur = chosen.length ? chosen : (multi ? [] : [def.id]);
    const opts = m.variants.map(v => ({ value: v.id, label: v.label || v.id }));
    parts.push(`<div class="field"><span class="label">Which applies?</span>${multi ? uiMultiPills('variant-' + m.id, opts, cur, { label: m.name + ' options' }) : uiSegmented('variant-' + m.id, opts, cur[0], { label: m.name + ' options' })}${!chosen.length && !multi ? `<div class="hint">Default: ${uiEsc(def.label || def.id)}.</div>` : ''}${m.variants.some(v => v.note) ? `<div class="hint">${m.variants.filter(v => v.note).map(v => uiEsc(v.note)).join(' ')}</div>` : ''}</div>`);
  }
  for (const [fid, f] of Object.entries(flags)) if (f.module === m.id) parts.push(`<div class="field"><span class="label">${uiEsc(f.label)}</span>${uiYesNo('flag-' + fid, person.flags[fid] === true ? true : person.flags[fid] === false ? false : null)}</div>`);
  for (const r of m.rules || []) {
    if (r.required_confirmation) {
      const on = person.confirmations.includes(r.id);
      parts.push(`<label class="choice" style="background:var(--surface)"><input type="checkbox" data-confirm-rule="${uiEsc(r.id)}" ${on ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Confirm before this module turns on</span><span class="small">${uiEsc(r.text)}</span></span></label>`);
    }
    if (r.optional === true || r.default === 'off') {
      const on = person.optional_rules.includes(r.id);
      parts.push(`<label class="choice" style="background:var(--surface)"><input type="checkbox" data-optional-rule="${uiEsc(r.id)}" ${on ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Optional rule ${on ? '(on)' : '(off)'}</span><span class="small">${uiEsc(r.text)}</span><span class="small muted"><br>Optional; evidence for blanket avoidance is limited.</span></span></label>`);
    }
    if (r.configurable) parts.push(peopleConfigurableRuleHTML(r, person));
  }
  return parts.length ? `<div class="subpanel">${parts.join('')}</div>` : '';
}
function peopleConfigurableRuleHTML(r, person) {
  const def = r.default || r.default_for_allergy || (r.kind === 'avoid' ? 'exclude' : 'allow');
  const cur = person.rule_settings[r.id] || def;
  return `<div class="field"><span class="label">${uiEsc(r.text)}</span>${uiSegmented('setting-' + r.id, [{ value: 'allow', label: 'Allow' }, { value: 'exclude', label: 'Exclude' }], cur, { label: r.id })}<div class="hint">Default: ${def}. Your choice: ${cur}.</div></div>`;
}
function peopleGlobalFlagsHTML(person) {
  const flags = Object.entries(uiState.conditionsMeta.flags || {}).filter(([, f]) => !f.module);
  if (!flags.length) return '';
  return `<h2>Also tell us</h2><div class="card">${flags.map(([fid, f]) => `<div class="field"><span class="label">${uiEsc(f.label)}</span>${uiYesNo('flag-' + fid, person.flags[fid] === true ? true : person.flags[fid] === false ? false : null)}</div>`).join('')}</div>`;
}
function peopleBindModulePanels(container, person, stepId) {
  container.querySelectorAll('input[data-seg^="variant-"]').forEach(inp => inp.addEventListener('change', () => {
    const mid = inp.dataset.seg.slice('variant-'.length);
    person.variants[mid] = [inp.value];
    if (mid === 'vegetarian-vegan') peopleSyncVegPatternFromVariant(person, inp.value);
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('input[data-multi^="variant-"]').forEach(inp => inp.addEventListener('change', () => {
    const mid = inp.dataset.multi.slice('variant-'.length);
    const cur = new Set(person.variants[mid] || []);
    if (inp.checked) cur.add(inp.value); else cur.delete(inp.value);
    person.variants[mid] = [...cur];
    uiPersist(); inp.closest('label').classList.toggle('on', inp.checked);
  }));
  container.querySelectorAll('input[data-seg^="flag-"]').forEach(inp => inp.addEventListener('change', () => {
    person.flags[inp.dataset.seg.slice('flag-'.length)] = inp.value === 'yes';
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('input[data-seg^="setting-"]').forEach(inp => inp.addEventListener('change', () => {
    person.rule_settings[inp.dataset.seg.slice('setting-'.length)] = inp.value;
    peopleRefresh(container, person, stepId, `input[data-seg="${inp.dataset.seg}"][value="${inp.value}"]`);
  }));
  container.querySelectorAll('[data-confirm-rule]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.confirmRule;
    if (inp.checked && !person.confirmations.includes(id)) person.confirmations.push(id);
    if (!inp.checked) person.confirmations = person.confirmations.filter(x => x !== id);
    peopleRefresh(container, person, stepId, `[data-confirm-rule="${id}"]`);
  }));
  container.querySelectorAll('[data-optional-rule]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.optionalRule;
    if (inp.checked && !person.optional_rules.includes(id)) person.optional_rules.push(id);
    if (!inp.checked) person.optional_rules = person.optional_rules.filter(x => x !== id);
    peopleRefresh(container, person, stepId, `[data-optional-rule="${id}"]`);
  }));
}

// Keep the Preferences pattern checkbox in step with a variant chosen on the Conditions step.
function peopleSyncVegPatternFromVariant(person, variant) {
  const prefs = person.preferences;
  prefs.patterns = prefs.patterns.filter(p => !PEOPLE_VEG_PATTERNS.includes(p));
  if (PEOPLE_VEG_PATTERNS.includes(variant)) prefs.patterns.push(variant);
}

// c) Allergens
function peopleStepAllergens(container, person) {
  const sel = new Set(person.allergens || []);
  const allergyModule = uiState.conditionsById.get('food-allergies');
  const configurable = ((allergyModule && allergyModule.rules) || []).filter(r => r.configurable);
  container.innerHTML = `
    <div class="notice block"><div class="notice-head">Stop</div><div>Allergens are hard exclusions. Nothing in this app overrides them: not a preference, not a mode, not an acknowledgment. When an ingredient is not recognized, the app says so and does not assume it is safe.</div></div>
    <p>Confirmed food allergies (the nine FDA major allergens):</p>
    <div class="choice-list">
      ${UI_ALLERGENS.map(a => `<label class="choice"><input type="checkbox" data-allergen="${a.tag}" ${sel.has(a.tag) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${a.label}</span></span></label>`).join('')}
    </div>
    ${configurable.length ? `<div class="card" style="margin-top:1rem"><h3>"May contain" and shared-facility labels</h3><p class="small muted">Many people with allergies avoid these. The evidence on actual risk is mixed, so this is your call. Applies when at least one allergen is listed above.</p>${configurable.map(r => peopleConfigurableRuleHTML(r, person)).join('')}</div>` : ''}`;
  container.querySelectorAll('[data-allergen]').forEach(inp => inp.addEventListener('change', () => {
    person.allergens = person.allergens || [];
    const t = inp.dataset.allergen;
    if (inp.checked && !person.allergens.includes(t)) person.allergens.push(t);
    if (!inp.checked) person.allergens = person.allergens.filter(x => x !== t);
    uiPersist();
  }));
  peopleBindModulePanels(container, person, 'allergens');
}

// d) Preferences, plus the custom diet builder.
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
  const patterns = [
    ['vegetarian', 'Vegetarian', hasVegModule ? 'Turns on the vegetarian, vegan, and pescatarian module with the vegetarian option: no red meat, poultry, fish, or processed meat.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['vegan', 'Vegan', hasVegModule ? 'Turns on the same module with the vegan option: no animal foods. Eggs and dairy are avoided as a pattern, not as allergies.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['pescatarian', 'Pescatarian', hasVegModule ? 'Turns on the same module with the pescatarian option: no red meat, poultry, or processed meat. Fish and seafood are kept.' : 'No vegetarian module is loaded; stored as a pattern only.'],
    ['halal', 'Halal', porkTag ? `Avoids pork (tag: ${uiTagLabel(porkTag)}).` : 'No pork tag exists in the dictionary, so pork rules are applied by name matching on ingredient text (pork, bacon, ham, lard, gelatin).'],
    ['kosher', 'Kosher', porkTag ? `Avoids pork (tag: ${uiTagLabel(porkTag)}) and shellfish by name matching.` : 'No pork tag exists in the dictionary, so pork and shellfish rules are applied by name matching on ingredient text.']
  ];
  container.innerHTML = `
    <p>Preferences are soft. They lower a recipe's score and show as a caution, and you can override them any time. They never loosen an allergen or a condition rule.</p>
    <h2>Pre-built patterns</h2>
    <div class="choice-list">
      ${patterns.map(([id, label, hint]) => `<label class="choice"><input type="checkbox" data-pattern="${id}" ${prefs.patterns.includes(id) ? 'checked' : ''}><span class="choice-body"><span class="choice-title">${uiEsc(label)}</span> <span class="small muted">${uiEsc(hint)}</span></span></label>`).join('')}
    </div>
    <p class="small muted">Halal and kosher rules beyond pork and shellfish (slaughter, certification, meat and dairy separation) are not something this app can check from ingredient text.</p>
    <h2>Foods to avoid (soft)</h2>
    ${uiMultiPills('avoid_tags', options, prefs.avoid_tags, { label: 'Soft avoid tags' })}
    <div class="field" style="margin-top:1rem"><label for="pp-terms">Words to avoid in ingredient text</label>
      <input id="pp-terms" type="text" value="${uiEsc(prefs.avoid_terms.join(', '))}" placeholder="cilantro, blue cheese" autocomplete="off">
      <div class="hint">Comma separated. Matched as plain text in ingredient lists and recipe names. Soft.</div></div>
    <h2 id="custom-diet">A diet not on the list</h2>
    ${peopleCustomDietHTML(person)}`;
  container.querySelectorAll('[data-pattern]').forEach(inp => inp.addEventListener('change', () => {
    const id = inp.dataset.pattern;
    if (inp.checked && !prefs.patterns.includes(id)) prefs.patterns.push(id);
    if (!inp.checked) prefs.patterns = prefs.patterns.filter(x => x !== id);
    if (inp.checked && PEOPLE_VEG_PATTERNS.includes(id)) prefs.patterns = prefs.patterns.filter(x => x === id || !PEOPLE_VEG_PATTERNS.includes(x));
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
  peopleBindCustomDiet(container, person);
}

function peopleApplyPatterns(person) {
  const prefs = person.preferences;
  const porkTag = peopleFindPorkTag();
  const wantTags = new Set();
  const wantTerms = new Set();
  for (const p of prefs.patterns) {
    if ((p === 'halal' || p === 'kosher')) {
      if (porkTag) wantTags.add(porkTag);
      for (const term of PEOPLE_PATTERN_TERMS[p] || []) if (!porkTag || !/^(pork|bacon|ham|lard|prosciutto|pancetta)$/.test(term)) wantTerms.add(term);
    }
  }
  // tags any pattern could have added, so we can remove the ones no longer wanted
  const allPatternTags = new Set(porkTag ? [porkTag] : []);
  const allPatternTerms = new Set([].concat(...Object.values(PEOPLE_PATTERN_TERMS)));
  prefs.avoid_tags = prefs.avoid_tags.filter(t => !allPatternTags.has(t) || wantTags.has(t));
  for (const t of wantTags) if (!prefs.avoid_tags.includes(t)) prefs.avoid_tags.push(t);
  prefs.avoid_terms = prefs.avoid_terms.filter(t => !allPatternTerms.has(t) || wantTerms.has(t));
  for (const t of wantTerms) if (!prefs.avoid_terms.includes(t)) prefs.avoid_terms.push(t);
  const veg = PEOPLE_VEG_PATTERNS.find(p => prefs.patterns.includes(p)) || null;
  person.modules = person.modules || [];
  if (uiState.conditionsById.has('vegetarian-vegan')) {
    if (veg && !person.modules.includes('vegetarian-vegan')) person.modules.push('vegetarian-vegan');
    if (veg) person.variants['vegetarian-vegan'] = [veg];
    if (!veg) { person.modules = person.modules.filter(m => m !== 'vegetarian-vegan'); delete person.variants['vegetarian-vegan']; }
  }
}

// ---- Custom diet builder ----
function peopleGuessFamily(id) {
  if (/^allergen-/.test(id)) return 'allergen';
  if (/^(gluten|oats-)/.test(id)) return 'gluten';
  if (/^soy/.test(id)) return 'soy';
  if (/^lactose/.test(id)) return 'dairy';
  if (/sugar|sweetener/.test(id)) return 'sugar';
  if (PEOPLE_PATTERN_TAG_FALLBACK.includes(id)) return 'pattern';
  return null;
}
function peopleCustomTagOptions() {
  const tags = uiState.data.dictionaries.tags || {};
  const out = [];
  for (const [id, def] of Object.entries(tags)) {
    if (id === 'may-contain') continue;
    const fam = (def && def.family) || peopleGuessFamily(id);
    if (!PEOPLE_CUSTOM_FAMILIES.includes(fam)) continue;
    const base = (def && def.label) || id;
    out.push({ value: id, label: fam === 'allergen' ? `${base} (as a preference)` : base, family: fam });
  }
  out.sort((a, b) => PEOPLE_CUSTOM_FAMILIES.indexOf(a.family) - PEOPLE_CUSTOM_FAMILIES.indexOf(b.family) || a.label.localeCompare(b.label));
  return out;
}
function peopleCustomBlankDraft() {
  return { editingId: null, name: '', summary: '', avoid_tags: [], avoid_terms: '', prefer_tags: [], limits: {}, notes: '', proposal: null, status: '' };
}
function peopleSlug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'diet';
}
function peopleClaudeAvailable() {
  return typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
}

function peopleCustomDietHTML(person) {
  const d = peopleCustomDraft || (peopleCustomDraft = peopleCustomBlankDraft());
  const existing = person.custom_modules || [];
  const tagOptions = peopleCustomTagOptions();
  const avoidOptions = tagOptions.slice();
  const preferOptions = tagOptions.filter(o => o.family === 'pattern');
  for (const t of d.avoid_tags) if (!avoidOptions.some(o => o.value === t)) avoidOptions.push({ value: t, label: uiTagLabel(t) });
  for (const t of d.prefer_tags) if (!preferOptions.some(o => o.value === t)) preferOptions.push({ value: t, label: uiTagLabel(t) });
  const fam = f => avoidOptions.filter(o => o.family === f);
  const famTitle = { pattern: 'Food groups', allergen: 'Allergen groups (as a preference, not an allergy)', dairy: 'Dairy and lactose', sugar: 'Sugar and sweeteners', gluten: 'Gluten', soy: 'Soy' };
  return `
    <p>Name a way of eating that is not on the list, say what you avoid, and the app treats it as your own module: soft rules, marked "Defined by you", with no evidence rating.</p>
    ${existing.length ? `<div class="choice-list" style="margin-bottom:1rem">${existing.map(cm => `<div class="card tight custom-card">
        <div class="row"><strong>${uiEsc(cm.name)}</strong> ${uiUserDefinedBadge()}</div>
        ${cm.summary ? `<div class="small">${uiEsc(cm.summary)}</div>` : ''}
        <div class="small muted">${[(cm.avoid_tags || []).length ? 'Avoid: ' + cm.avoid_tags.map(uiTagLabel).join(', ') : '', (cm.avoid_terms || []).length ? 'Words: ' + cm.avoid_terms.join(', ') : '', (cm.prefer_tags || []).length ? 'Prefer: ' + cm.prefer_tags.map(uiTagLabel).join(', ') : '', Object.keys(cm.limits || {}).length ? 'Limits: ' + Object.entries(cm.limits).map(([k, v]) => `${uiNutrientLabel(k)} ${v}`).join(', ') : ''].filter(Boolean).map(uiEsc).join('. ') || 'No rules yet.'}</div>
        <div class="btn-row"><button class="btn small" type="button" data-custom-edit="${uiEsc(cm.id)}">Edit</button><button class="btn small danger" type="button" data-custom-remove="${uiEsc(cm.id)}">Remove</button></div>
      </div>`).join('')}</div>` : ''}
    <div class="card" id="custom-diet-form">
      <h3 style="margin-top:0">${d.editingId ? 'Edit this diet' : 'Add a diet'}</h3>
      <div class="field"><label for="cd-name">What is it called?</label><input id="cd-name" type="text" maxlength="60" value="${uiEsc(d.name)}" placeholder="for example: Whole30, Nordic diet, my cardiologist's plan" autocomplete="off"></div>
      <div class="field"><label for="cd-summary">What is it, in a sentence? (optional)</label><input id="cd-summary" type="text" maxlength="240" value="${uiEsc(d.summary)}" autocomplete="off"></div>
      ${peopleClaudeAvailable() ? `<div class="btn-row" style="margin-top:0"><button class="btn" type="button" id="cd-ask">Ask Claude what this diet usually means</button><span class="small muted" id="cd-ask-status" aria-live="polite">${uiEsc(d.status || '')}</span></div>` : ''}
      ${d.proposal ? peopleProposalHTML(d.proposal) : ''}
      <h4>What does it avoid?</h4>
      ${PEOPLE_CUSTOM_FAMILIES.map(f => fam(f).length ? `<div class="field"><span class="label small">${famTitle[f]}</span>${uiMultiPills('cd-avoid', fam(f), d.avoid_tags, { label: famTitle[f] })}</div>` : '').join('')}
      ${avoidOptions.length ? '' : '<p class="small muted">No tag dictionary is loaded, so only free-text words can be added.</p>'}
      <div class="field"><label for="cd-terms">Other words to avoid in ingredient text</label><input id="cd-terms" type="text" value="${uiEsc(d.avoid_terms)}" placeholder="pork, corn syrup" autocomplete="off"><div class="hint">Comma separated. Matched as plain text.</div></div>
      ${preferOptions.length ? `<div class="field"><span class="label">Foods it favors (optional)</span>${uiMultiPills('cd-prefer', preferOptions, d.prefer_tags, { label: 'Prefer tags' })}</div>` : ''}
      <h4>Daily limits (optional)</h4>
      <p class="small muted">Only if the diet is defined by a number. Leave blank otherwise. These are soft and never replace a clinician number.</p>
      <div class="limits-grid">${PEOPLE_CUSTOM_LIMITS.map(l => `<div class="field"><label for="cd-limit-${l.key}">${l.label}</label><div class="row"><input id="cd-limit-${l.key}" type="number" inputmode="decimal" min="0" step="any" data-limit="${l.key}" value="${typeof d.limits[l.key] === 'number' ? d.limits[l.key] : ''}" style="max-width:140px"><span class="small muted">${l.unit}</span></div></div>`).join('')}</div>
      <div class="field"><label for="cd-notes">Notes (optional)</label><textarea id="cd-notes" style="min-height:60px">${uiEsc(d.notes)}</textarea></div>
      <div class="btn-row"><button class="btn primary" type="button" id="cd-save">${d.editingId ? 'Save changes' : 'Save this diet'}</button><button class="btn" type="button" id="cd-clear">${d.editingId ? 'Cancel' : 'Clear'}</button></div>
    </div>`;
}

function peopleProposalHTML(p) {
  const list = arr => Array.isArray(arr) && arr.length ? arr.map(x => uiEsc(String(x))).join(', ') : '<span class="muted">none</span>';
  return `<div class="notice info proposal" role="status"><div class="notice-head">Claude's suggestion</div>
    <div><strong>This is Claude's summary from general knowledge, not a medical source. Check it, change anything wrong, then save.</strong></div>
    <dl class="kv" style="margin-top:.5rem">
      <dt>Summary</dt><dd>${uiEsc(p.summary || '')}</dd>
      <dt>Avoid</dt><dd>${list((p.avoid_tags || []).map(uiTagLabel))}</dd>
      <dt>Avoid words</dt><dd>${list(p.avoid_terms)}</dd>
      <dt>Prefer</dt><dd>${list((p.prefer_tags || []).map(uiTagLabel))}</dd>
      <dt>Limits</dt><dd>${Object.keys(p.limits || {}).length ? Object.entries(p.limits).map(([k, v]) => `${uiEsc(uiNutrientLabel(k))}: ${uiEsc(v)}`).join(', ') : '<span class="muted">none</span>'}</dd>
      <dt>Cautions</dt><dd>${list(p.cautions)}</dd>
    </dl>
    <div class="btn-row"><button class="btn primary small" type="button" id="cd-accept">Put this into the form</button><button class="btn small" type="button" id="cd-dismiss">Ignore</button></div>
    <p class="small muted" style="margin:.5rem 0 0">Nothing is saved until you press "Save this diet".</p></div>`;
}

function peopleReadCustomForm(container, d) {
  const q = sel => container.querySelector(sel);
  if (q('#cd-name')) d.name = q('#cd-name').value;
  if (q('#cd-summary')) d.summary = q('#cd-summary').value;
  if (q('#cd-terms')) d.avoid_terms = q('#cd-terms').value;
  if (q('#cd-notes')) d.notes = q('#cd-notes').value;
  container.querySelectorAll('[data-limit]').forEach(inp => { const v = inp.value.trim(); if (v === '') delete d.limits[inp.dataset.limit]; else d.limits[inp.dataset.limit] = Number(v); });
}

function peopleBindCustomDiet(container, person) {
  const d = peopleCustomDraft;
  const rerender = () => { peopleReadCustomForm(container, d); peopleRefresh(container, person, 'preferences', '#cd-name'); };
  container.querySelectorAll('[data-custom-edit]').forEach(b => b.addEventListener('click', () => {
    const cm = (person.custom_modules || []).find(x => x.id === b.dataset.customEdit);
    if (!cm) return;
    peopleCustomDraft = { ...peopleCustomBlankDraft(), editingId: cm.id, name: cm.name || '', summary: cm.summary || '', avoid_tags: (cm.avoid_tags || []).slice(), avoid_terms: (cm.avoid_terms || []).join(', '), prefer_tags: (cm.prefer_tags || []).slice(), limits: { ...(cm.limits || {}) }, notes: cm.notes || '' };
    peopleRefresh(container, person, 'preferences', '#cd-name');
    const form = container.querySelector('#custom-diet-form'); if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  container.querySelectorAll('[data-custom-remove]').forEach(b => b.addEventListener('click', () => {
    const cm = (person.custom_modules || []).find(x => x.id === b.dataset.customRemove);
    if (!cm || !window.confirm(`Remove "${cm.name}" from this person?`)) return;
    person.custom_modules = person.custom_modules.filter(x => x.id !== cm.id);
    if (peopleCustomDraft && peopleCustomDraft.editingId === cm.id) peopleCustomDraft = null;
    uiToast('Removed.');
    peopleRefresh(container, person, 'preferences');
  }));
  const form = container.querySelector('#custom-diet-form');
  if (!form) return;
  ['#cd-name', '#cd-summary', '#cd-terms', '#cd-notes'].forEach(sel => { const el = form.querySelector(sel); if (el) el.addEventListener('input', () => peopleReadCustomForm(container, d)); });
  form.querySelectorAll('[data-limit]').forEach(inp => inp.addEventListener('change', () => peopleReadCustomForm(container, d)));
  form.querySelectorAll('input[data-multi="cd-avoid"]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked && !d.avoid_tags.includes(inp.value)) d.avoid_tags.push(inp.value);
    if (!inp.checked) d.avoid_tags = d.avoid_tags.filter(x => x !== inp.value);
    inp.closest('label').classList.toggle('on', inp.checked);
  }));
  form.querySelectorAll('input[data-multi="cd-prefer"]').forEach(inp => inp.addEventListener('change', () => {
    if (inp.checked && !d.prefer_tags.includes(inp.value)) d.prefer_tags.push(inp.value);
    if (!inp.checked) d.prefer_tags = d.prefer_tags.filter(x => x !== inp.value);
    inp.closest('label').classList.toggle('on', inp.checked);
  }));
  form.querySelector('#cd-clear').addEventListener('click', () => { peopleCustomDraft = null; peopleRefresh(container, person, 'preferences', '#cd-name'); });
  form.querySelector('#cd-save').addEventListener('click', () => {
    peopleReadCustomForm(container, d);
    const name = d.name.trim();
    if (!name) { uiToast('Give the diet a name first.'); form.querySelector('#cd-name').focus(); return; }
    const avoid_terms = Array.from(new Set(d.avoid_terms.split(',').map(s => s.trim()).filter(Boolean)));
    const limits = {};
    for (const l of PEOPLE_CUSTOM_LIMITS) if (typeof d.limits[l.key] === 'number' && d.limits[l.key] >= 0) limits[l.key] = d.limits[l.key];
    if (!d.avoid_tags.length && !avoid_terms.length && !d.prefer_tags.length && !Object.keys(limits).length) { uiToast('Pick at least one thing to avoid, favor, or limit.'); return; }
    person.custom_modules = person.custom_modules || [];
    let id = d.editingId;
    if (!id) { const base = 'custom-' + peopleSlug(name); id = base; let n = 2; while (person.custom_modules.some(x => x.id === id)) id = `${base}-${n++}`; }
    const entry = { id, name, summary: d.summary.trim(), avoid_tags: d.avoid_tags.slice(), avoid_terms, prefer_tags: d.prefer_tags.slice(), limits, notes: d.notes.trim() };
    const i = person.custom_modules.findIndex(x => x.id === id);
    if (i >= 0) person.custom_modules[i] = entry; else person.custom_modules.push(entry);
    peopleCustomDraft = null;
    uiToast(`Saved "${name}".`);
    peopleRefresh(container, person, 'preferences');
  });
  const ask = form.querySelector('#cd-ask');
  if (ask) ask.addEventListener('click', async () => {
    peopleReadCustomForm(container, d);
    const name = d.name.trim();
    const status = form.querySelector('#cd-ask-status');
    if (!name) { status.textContent = 'Type the name of the diet first.'; form.querySelector('#cd-name').focus(); return; }
    ask.disabled = true; status.textContent = 'Thinking...';
    try {
      const sample = await window.claude.use('sample');
      if (!sample) { d.status = 'Claude is not available in this view.'; status.textContent = d.status; ask.disabled = false; return; }
      const allowed = peopleCustomTagOptions().map(o => o.value);
      const prompt = `A person is describing an eating pattern by name so a nutrition app can turn it into soft food rules. The diet is called "${name}".${d.summary.trim() ? ` The person describes it as: "${d.summary.trim()}".` : ''}
Reply with only one strict JSON object with exactly these keys:
"summary": one plain sentence saying what this diet usually means (general knowledge, no medical claims);
"avoid_tags": an array of strings chosen ONLY from this list of tags, for foods the diet usually avoids: ${JSON.stringify(allowed)};
"avoid_terms": an array of short lowercase ingredient words the diet usually avoids that the tag list does not cover (may be empty);
"prefer_tags": an array of strings chosen ONLY from the same tag list, for foods the diet usually emphasizes (may be empty);
"limits": an object with any of "sodium_mg", "added_sugar_g", "satfat_g", "carb_g" as numbers per day, included ONLY when the diet is commonly defined by that number, otherwise {};
"cautions": an array of one or two short sentences about who should be careful with this diet.
Do not invent medical numbers. If you do not know the diet, say so in the summary and leave the arrays empty.
Example: {"summary":"...","avoid_tags":["red-meat"],"avoid_terms":["pork"],"prefer_tags":["vegetable"],"limits":{},"cautions":["..."]}`;
      const data = await sample.json(prompt, { modelTier: 'quick' });
      const allowedSet = new Set(allowed);
      const arr = x => Array.isArray(x) ? x.map(s => String(s).trim()).filter(Boolean) : [];
      const limits = {};
      if (data && data.limits && typeof data.limits === 'object') for (const l of PEOPLE_CUSTOM_LIMITS) if (typeof data.limits[l.key] === 'number' && data.limits[l.key] > 0) limits[l.key] = data.limits[l.key];
      d.proposal = {
        summary: data && typeof data.summary === 'string' ? data.summary.slice(0, 240) : '',
        avoid_tags: arr(data && data.avoid_tags).filter(t => allowedSet.has(t)),
        avoid_terms: arr(data && data.avoid_terms).slice(0, 20),
        prefer_tags: arr(data && data.prefer_tags).filter(t => allowedSet.has(t)),
        limits,
        cautions: arr(data && data.cautions).slice(0, 3)
      };
      d.status = '';
      rerender();
    } catch (e) {
      const code = e && e.code;
      d.status = code === 'not_granted' || code === 'sampling_disabled' ? 'Claude is not allowed for this page. You can still fill the form by hand.' : code === 'rate_limited' ? 'Claude is busy. Try again in a little while.' : code === 'invalid_json' ? 'The answer could not be read. Try again or fill the form by hand.' : 'Claude did not answer. Fill the form by hand.';
      status.textContent = d.status;
      ask.disabled = false;
    }
  });
  const accept = form.querySelector('#cd-accept');
  if (accept) accept.addEventListener('click', () => {
    const p = d.proposal;
    peopleReadCustomForm(container, d);
    if (p.summary && !d.summary.trim()) d.summary = p.summary;
    for (const t of p.avoid_tags) if (!d.avoid_tags.includes(t)) d.avoid_tags.push(t);
    for (const t of p.prefer_tags) if (!d.prefer_tags.includes(t)) d.prefer_tags.push(t);
    const terms = new Set(d.avoid_terms.split(',').map(s => s.trim()).filter(Boolean));
    for (const t of p.avoid_terms) terms.add(t);
    d.avoid_terms = [...terms].join(', ');
    for (const [k, v] of Object.entries(p.limits)) if (typeof d.limits[k] !== 'number') d.limits[k] = v;
    if (p.cautions.length) d.notes = [d.notes.trim(), 'Cautions (from Claude, general knowledge): ' + p.cautions.join(' ')].filter(Boolean).join('\n');
    d.proposal = null;
    uiToast('Filled in. Check it, then save.');
    peopleRefresh(container, person, 'preferences', '#cd-name');
  });
  const dismiss = form.querySelector('#cd-dismiss');
  if (dismiss) dismiss.addEventListener('click', () => { d.proposal = null; rerender(); });
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
  const base = p => String(p).replace(/_(max|min|target|per_kg|treatment|gdm)/g, '');
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
    ${list.some(t => /per_kg/.test(t.param)) && !person.weight_kg ? '<div class="notice warn"><div class="notice-head">Caution</div><div>Some of these are per kilogram of body weight. Enter a weight on the Basics step so they can become daily numbers.</div></div>' : ''}
    ${list.length ? list.map(t => `<div class="card">
      <label for="pt-${uiEsc(t.param)}">${uiEsc(t.label || t.param)}${/per_kg/.test(t.param) ? ' <span class="badge gray outline">per kilogram</span>' : ''}</label>
      <div class="small muted">${uiEsc(t.moduleName || '')}${t.when ? ` (applies when: ${uiEsc(t.when)})` : ''}</div>
      ${t.consensus ? `<div class="small"><strong>Published range:</strong> ${uiEsc(t.consensus)}</div>` : ''}
      ${t.why ? `<div class="small muted">${uiEsc(t.why)}</div>` : ''}
      <div class="row" style="margin-top:.5rem">
        <input id="pt-${uiEsc(t.param)}" type="number" inputmode="decimal" step="any" style="max-width:220px" data-tier2="${uiEsc(t.param)}" value="${typeof person.tier2[t.param] === 'number' ? person.tier2[t.param] : ''}" aria-describedby="pt-help-${uiEsc(t.param)}">
        <span class="muted small">${uiEsc(uiParamUnit(t.param))}</span>
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

// g) Cooking: three short sub-screens, one question at a time, big tappable answers.
function peopleStepCooking(container, person, sub) {
  person.cooking = person.cooking || {};
  const c = person.cooking;
  const subIdx = PEOPLE_COOKING_SUBS.findIndex(s => s.id === sub);
  const nextHash = subIdx < PEOPLE_COOKING_SUBS.length - 1 ? `cooking/${PEOPLE_COOKING_SUBS[subIdx + 1].id}` : 'review';
  const progress = `<p class="small muted cooking-progress">Cooking, part ${subIdx + 1} of ${PEOPLE_COOKING_SUBS.length}</p>`;
  if (sub === 'time') {
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">How much time do you have to cook?</h2>
      <p class="muted">Pick what is true most weeks. Meals are chosen to fit this time. You can change it later.</p>
      <h3 class="big-sub">On weekdays</h3>
      ${uiBigChoices('weekday_minutes', PEOPLE_TIME_OPTIONS, peopleTimeBucket(c.weekday_minutes || 20), { label: 'Weekday cooking time', cols: 2 })}
      <h3 class="big-sub">On weekends</h3>
      ${uiBigChoices('weekend_minutes', PEOPLE_TIME_OPTIONS, peopleTimeBucket(c.weekend_minutes || 40), { label: 'Weekend cooking time', cols: 2 })}
      ${peopleTypicalHTML('30 minutes on weekdays, 45 or more on weekends')}
    </div>`;
    peopleBindSeg(container, person, 'cooking', 'weekday_minutes', v => { c.weekday_minutes = Number(v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'weekend_minutes', v => { c.weekend_minutes = Number(v); }, { rerender: false });
    peopleBindTypical(container, person, () => { c.weekday_minutes = 30; c.weekend_minutes = 45; }, nextHash);
  } else if (sub === 'days') {
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">Which days can you cook?</h2>
      <p class="muted">On the other days the plan uses leftovers or meals you just put together.</p>
      <div class="btn-row" style="margin:0 0 .75rem"><button class="btn" type="button" data-days="most">Most days</button><button class="btn" type="button" data-days="weekends">Weekends only</button></div>
      <div class="day-toggles">${uiBigToggles('cook_days', PEOPLE_DAYS, c.cook_days || [], { label: 'Days you can cook' })}</div>
      <h2 class="big-q" style="margin-top:1.5rem">How do you feel about cooking?</h2>
      ${uiBigChoices('interest', PEOPLE_INTEREST_OPTIONS, c.interest || 'simple', { label: 'Interest in cooking' })}
      ${peopleTypicalHTML('every day, and cook if it is simple')}
    </div>`;
    peopleBindMulti(container, person, 'cooking', 'cook_days', (v, on) => { c.cook_days = c.cook_days || []; if (on && !c.cook_days.includes(v)) c.cook_days.push(v); if (!on) c.cook_days = c.cook_days.filter(x => x !== v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'interest', v => { c.interest = v; }, { rerender: false });
    container.querySelectorAll('[data-days]').forEach(b => b.addEventListener('click', () => {
      c.cook_days = b.dataset.days === 'weekends' ? ['sat', 'sun'] : PEOPLE_DAYS.map(d => d.value);
      peopleRefresh(container, person, 'cooking', `[data-days="${b.dataset.days}"]`, 'days');
    }));
    peopleBindTypical(container, person, () => { c.cook_days = PEOPLE_DAYS.map(d => d.value); c.interest = 'simple'; }, nextHash);
  } else {
    const household = Math.max(1, Number(c.household) || 1);
    container.innerHTML = `<div class="cooking-screen">${progress}
      <h2 class="big-q">What do you have in your kitchen?</h2>
      <p class="muted">Tap everything you can use.</p>
      ${uiBigToggles('equipment', PEOPLE_EQUIPMENT, c.equipment || [], { label: 'Equipment', cols: 2 })}
      <h2 class="big-q" style="margin-top:1.5rem">Leftovers?</h2>
      ${uiBigChoices('leftovers', PEOPLE_LEFTOVER_OPTIONS, c.leftovers || 'ok', { label: 'Leftovers' })}
      <h2 class="big-q" style="margin-top:1.5rem" id="pc-household-label">How many people are you usually cooking for?</h2>
      <div class="stepper-ctl" role="group" aria-labelledby="pc-household-label">
        <button class="btn stepper-btn" type="button" id="pc-minus" aria-label="Fewer people">&minus;</button>
        <output class="stepper-value" id="pc-household" aria-live="polite">${household}</output>
        <button class="btn stepper-btn" type="button" id="pc-plus" aria-label="More people">+</button>
      </div>
      <h2 class="big-q" style="margin-top:1.5rem">Where do you shop?</h2>
      ${uiBigChoices('grocery', PEOPLE_SHOP_OPTIONS, c.grocery || 'supermarket', { label: 'Where you shop' })}
      <label class="choice big-check" style="margin-top:1.25rem"><input type="checkbox" id="pc-budget" ${c.budget ? 'checked' : ''}><span class="choice-body"><span class="choice-title">Save money: reuse ingredients across the week</span><span class="small muted">The week leans on recipes that share ingredients, so there is less to buy.</span></span></label>
      ${peopleTypicalHTML('stove, oven and microwave; some leftovers; cooking for two; a full supermarket')}
    </div>`;
    peopleBindMulti(container, person, 'cooking', 'equipment', (v, on) => { c.equipment = c.equipment || []; if (on && !c.equipment.includes(v)) c.equipment.push(v); if (!on) c.equipment = c.equipment.filter(x => x !== v); }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'leftovers', v => { c.leftovers = v; }, { rerender: false });
    peopleBindSeg(container, person, 'cooking', 'grocery', v => { c.grocery = v; }, { rerender: false });
    const out = container.querySelector('#pc-household');
    const setHousehold = n => { c.household = Math.min(12, Math.max(1, n)); out.textContent = c.household; uiPersist(); };
    container.querySelector('#pc-minus').addEventListener('click', () => setHousehold((Number(c.household) || 1) - 1));
    container.querySelector('#pc-plus').addEventListener('click', () => setHousehold((Number(c.household) || 1) + 1));
    container.querySelector('#pc-budget').addEventListener('change', e => { c.budget = !!e.target.checked; uiPersist(); });
    peopleBindTypical(container, person, () => { c.equipment = ['stove', 'oven', 'microwave']; c.leftovers = 'ok'; c.household = Math.max(2, Number(c.household) || 0); c.grocery = 'supermarket'; }, nextHash);
  }
}
function peopleTypicalHTML(what) {
  return `<div class="typical"><button class="btn" type="button" id="pc-typical">Use typical answers</button><span class="small muted">Fills in: ${uiEsc(what)}. Then moves on.</span></div>`;
}
function peopleBindTypical(container, person, fill, nextHash) {
  container.querySelector('#pc-typical').addEventListener('click', () => {
    fill();
    uiPersist();
    uiToast('Typical answers filled in.');
    uiNavigate(`#/people/${person.id}/${nextHash}`);
  });
}

// h) Review
function peopleStepReview(container, person) {
  uiEnsureUserDefinedSource();
  const plan = uiPlanFor(person);
  const prefs = person.preferences || {};
  const c = person.cooking || {};
  const act = ACTIVITY_LEVELS.find(l => l.id === person.activity);
  const wh = uiWeightHeightText(person, { kgToLb, cmToFtIn });
  const kv = [
    ['Adult', person.adult === false ? 'No (caregiver mode)' : 'Yes'],
    ['Sex, age', `${uiEsc(person.sex || 'not set')}${person.age ? ', ' + uiEsc(person.age) : ''}`],
    ['Weight, height', uiEsc(wh || 'not entered')],
    ['Activity', uiEsc(act ? act.label : 'not set')],
    ['Pregnant or breastfeeding', person.pregnancy || person.breastfeeding ? 'Yes' : 'No'],
    ['Modules', plan.modules.length ? plan.modules.map(m => m.category === 'custom' ? `${uiEsc(m.name)} ${uiUserDefinedBadge()}` : uiEsc(m.name)).join(', ') : 'none'],
    ['Turned off', plan.disabledModules.length ? plan.disabledModules.map(d => `${uiEsc(uiModuleName(d.id))} (by ${uiEsc(uiModuleName(d.by))})`).join(', ') : 'none'],
    ['Options', Object.entries(person.variants || {}).filter(([, v]) => v && v.length).map(([k, v]) => `${uiEsc(uiModuleName(k))}: ${uiEsc([].concat(v).join(', '))}`).join('; ') || 'defaults'],
    ['Flags', Object.entries(person.flags || {}).filter(([, v]) => v).map(([k]) => uiEsc((uiState.conditionsMeta.flags[k] || { label: k }).label)).join('; ') || 'none'],
    ['Confirmations', (person.confirmations || []).length ? person.confirmations.map(uiEsc).join(', ') : 'none'],
    ['Allergens', (person.allergens || []).length ? person.allergens.map(t => uiEsc(peopleAllergenLabel(t))).join(', ') : 'none'],
    ['Patterns', uiEsc((prefs.patterns || []).join(', ') || 'none')],
    ['Your own diets', (person.custom_modules || []).length ? person.custom_modules.map(cm => uiEsc(cm.name)).join(', ') : 'none'],
    ['Soft avoid', uiEsc((prefs.avoid_tags || []).map(uiTagLabel).join(', ') || 'none')],
    ['Avoid words', uiEsc((prefs.avoid_terms || []).join(', ') || 'none')],
    ['Medications', uiEsc(Object.entries(person.medications || {}).filter(([, v]) => v).map(([k]) => k.replace(/_/g, ' ')).join(', ') || 'none flagged')],
    ['Clinician numbers', Object.keys(person.tier2 || {}).length ? uiEsc(Object.entries(person.tier2).map(([k, v]) => `${k}: ${v}`).join(', ')) : 'none entered'],
    ['Cooking', uiEsc(`${c.weekday_minutes || 20} min weekdays, ${c.weekend_minutes || 40} min weekends, ${(c.cook_days || []).length} cook days, ${c.interest || 'simple'}, cooking for ${c.household || 1}${c.budget ? ', reuse ingredients to save money' : ''}`)]
  ];
  container.innerHTML = `
    <div class="card"><dl class="kv">${kv.map(([k, v]) => `<dt>${uiEsc(k)}</dt><dd>${v}</dd>`).join('')}</dl></div>
    ${plan.notices.filter(n => n.level !== 'info').length ? `<h2>The plan will show these notices</h2>${plan.notices.filter(n => n.level !== 'info').map(n => `<div class="notice ${n.level}"><div class="notice-head">${n.level === 'block' ? 'Stop' : 'Caution'}</div><div>${uiEsc(n.text)}</div></div>`).join('')}` : ''}
    <div class="finish"><button class="btn primary big" type="button" id="pr-save">Save and see my plan</button><p class="small muted" style="margin:.5rem 0 0">You can come back and change any step from the People screen.</p></div>`;
  container.querySelector('#pr-save').addEventListener('click', () => {
    person.setup_complete = true;
    uiSetActive(person.id);
    uiPersist();
    uiToast('Saved.');
    uiNavigate('#/plan');
  });
}
