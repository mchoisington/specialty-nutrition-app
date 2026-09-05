// Home: who is active, the plan's notices, quick links.
import { uiState, uiEsc, uiActivePerson, uiSetActive, uiPlanFor, uiPersist, uiNoticeHTML, uiNavigate, uiRatingBadge } from './common.js';

export function renderHomeScreen(root) {
  const person = uiActivePerson();
  const people = uiState.profile.people;
  const plan = uiPlanFor(person);
  const notices = plan ? plan.notices : [];
  const blocks = notices.filter(n => n.level === 'block');
  const warns = notices.filter(n => n.level === 'warn');
  const infos = notices.filter(n => n.level === 'info');

  root.innerHTML = `
    <h1>Home</h1>
    <div class="card">
      <div class="row between">
        <div class="person-row">
          <span class="avatar" aria-hidden="true">${uiEsc((person.name || '?').slice(0, 1).toUpperCase())}</span>
          <div><div class="name">${uiEsc(person.name)}</div><div class="small muted">${person.adult === false ? 'Caregiver mode (child)' : 'Adult'}${person.age ? `, ${uiEsc(person.age)} years` : ''}</div></div>
        </div>
        <div class="row">
          ${people.length > 1 ? `<label class="visually-hidden" for="home-person">Active person</label><select id="home-person" style="width:auto">${people.map(p => `<option value="${uiEsc(p.id)}" ${p.id === person.id ? 'selected' : ''}>${uiEsc(p.name)}</option>`).join('')}</select>` : ''}
          <a class="btn small" href="#/people/${uiEsc(person.id)}">Edit profile</a>
        </div>
      </div>
      <div class="row" style="margin-top:.75rem">
        ${plan.modules.length ? plan.modules.map(m => `<span class="badge gray outline">${uiEsc(m.name)}</span>`).join(' ') : '<span class="muted small">No conditions or patterns selected yet.</span>'}
        ${(person.allergens || []).length ? `<span class="badge red">${person.allergens.length} allergen${person.allergens.length > 1 ? 's' : ''}</span>` : ''}
      </div>
    </div>

    <h2>Notices</h2>
    ${notices.length ? '' : '<p class="muted">No notices. The plan built without conflicts or missing numbers.</p>'}
    <div id="home-notices">
      ${blocks.map(n => uiNoticeHTML(n, { person })).join('')}
      ${warns.map(n => uiNoticeHTML(n, { person })).join('')}
      ${infos.map(n => uiNoticeHTML(n, { person })).join('')}
    </div>

    <h2>Go to</h2>
    <div class="quick-links">
      <a href="#/plan">Plan<small>Numbers, avoid list, conflicts</small></a>
      <a href="#/check">Check a food<small>Paste an ingredient list</small></a>
      <a href="#/week">This week<small>Meals that fit your time</small></a>
      <a href="#/grocery">Grocery list<small>From this week's meals</small></a>
      <a href="#/log">Symptom log<small>Meals and how you felt</small></a>
      <a href="#/learn">Learn<small>The evidence, plainly</small></a>
      <a href="#/people">People<small>Add or switch a person</small></a>
      <a href="#/settings">Settings<small>Backup, import, about</small></a>
    </div>
    <p class="small muted" style="margin-top:1.5rem">This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</p>
  `;

  const sel = root.querySelector('#home-person');
  if (sel) sel.addEventListener('change', () => { uiSetActive(sel.value); uiState.rerender(); });
  root.querySelectorAll('[data-ack]').forEach(btn => btn.addEventListener('click', () => {
    person.acknowledged = person.acknowledged || [];
    if (!person.acknowledged.includes(btn.dataset.ack)) person.acknowledged.push(btn.dataset.ack);
    uiPersist();
    uiState.rerender();
  }));
}
