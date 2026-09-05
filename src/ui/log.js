// Log: symptom diary. Meals eaten against symptoms, day by day. No analytics claims.
import { checkText } from '../engine/checker.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiIsoDate, uiToday, uiFmtDate, uiToast, uiVerdictWord } from './common.js';
import { weekGet } from './week.js';

const LOG_SYMPTOMS = [
  { id: 'bloating', label: 'Bloating' },
  { id: 'pain', label: 'Abdominal pain' },
  { id: 'reflux', label: 'Reflux' },
  { id: 'headache', label: 'Headache' },
  { id: 'flushing', label: 'Flushing' },
  { id: 'fatigue', label: 'Fatigue' },
  { id: 'stool_change', label: 'Stool change' }
];
const LOG_LEVELS = ['none', 'mild', 'moderate', 'severe'];

let logDraft = null;

export function renderLogScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const today = uiIsoDate(uiToday());
  if (!logDraft || logDraft.person !== person.id) logDraft = { person: person.id, date: today, meal: 'lunch', recipe: '', text: '', symptoms: {}, notes: '' };
  const d = logDraft;
  const week = uiState.data.recipes.length ? weekGet(person, plan) : null;
  const dayMeals = week ? (week.days.find(x => x.date === d.date) || { meals: [] }).meals.filter(m => m.recipe) : [];
  const entries = (uiState.profile.log || []).filter(e => e.person === person.id);
  const cutoff = new Date(uiToday().getTime() - 13 * 86400000);
  const recent = entries.filter(e => new Date(e.date + 'T00:00:00') >= cutoff).sort((a, b) => b.date.localeCompare(a.date) || String(b.logged_at || '').localeCompare(String(a.logged_at || '')));
  const byDate = {};
  for (const e of recent) (byDate[e.date] ||= []).push(e);
  const inElimination = plan.phases.filter(p => /elimination|reintroduction/.test(p.phase));
  const textCheck = d.text.trim() ? checkText(d.text, plan, uiState.matcher, person) : null;

  root.innerHTML = `
    <h1>Log</h1>
    ${inElimination.length ? `<div class="notice info"><div class="notice-head">Info</div><div>${inElimination.map(p => `${uiEsc(p.moduleName)} is in the ${uiEsc(p.label)} phase.`).join(' ')} This log is how you identify your triggers: note what you ate and how you felt over the next day or so, then compare across the reintroduction of each food group. The app records; it does not interpret.</div></div>` : ''}
    <div class="card">
      <h2 style="margin-top:0">New entry</h2>
      <div class="grid-2">
        <div class="field"><label for="log-date">Date</label><input id="log-date" type="date" value="${uiEsc(d.date)}" max="${today}"></div>
        <div class="field"><label for="log-meal">Meal</label><select id="log-meal">${['breakfast', 'lunch', 'dinner', 'snack'].map(s => `<option value="${s}" ${d.meal === s ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="log-recipe">Meal from this week's plan</label>
        <select id="log-recipe"><option value="">Not from the plan</option>${dayMeals.map(m => `<option value="${uiEsc(m.recipe)}" ${d.recipe === m.recipe ? 'selected' : ''}>${uiEsc(m.slot)}: ${uiEsc(m.name)}</option>`).join('')}</select>
        ${!dayMeals.length ? '<div class="hint">No planned meals for this date. Describe the meal below instead.</div>' : ''}</div>
      <div class="field"><label for="log-text">Or describe what you ate</label><textarea id="log-text" style="min-height:80px" placeholder="oatmeal with banana and almond butter">${uiEsc(d.text)}</textarea>
        ${textCheck ? `<div class="small" style="margin-top:.25rem"><span class="badge ${textCheck.verdict === 'fail' ? 'red' : textCheck.verdict === 'caution' ? 'amber' : 'green'}">${uiVerdictWord(textCheck.verdict)}</span> ${textCheck.hits.length ? 'Matched: ' + textCheck.hits.map(h => uiEsc(h.label)).join(', ') + '.' : ''} ${textCheck.unrecognized.length ? 'Not recognized: ' + textCheck.unrecognized.map(uiEsc).join('; ') + '.' : ''}</div>` : ''}</div>
      <h3>Symptoms</h3>
      ${LOG_SYMPTOMS.map(s => `<div class="field"><label for="log-sym-${s.id}">${s.label}: <span id="log-symval-${s.id}">${LOG_LEVELS[d.symptoms[s.id] || 0]}</span></label><input id="log-sym-${s.id}" type="range" min="0" max="3" step="1" value="${d.symptoms[s.id] || 0}" data-sym="${s.id}" aria-valuetext="${LOG_LEVELS[d.symptoms[s.id] || 0]}"></div>`).join('')}
      <div class="field"><label for="log-notes">Notes</label><textarea id="log-notes" style="min-height:70px">${uiEsc(d.notes)}</textarea></div>
      <div class="btn-row"><button class="btn primary" type="button" id="log-save">Save entry</button></div>
    </div>

    <h2>Last 14 days</h2>
    ${Object.keys(byDate).length ? Object.entries(byDate).map(([date, list]) => `<section class="card tight"><h3>${uiFmtDate(date)}</h3>
      ${list.map(e => `<div class="rule"><div class="row between"><div><strong>${uiEsc(e.meal || '')}</strong> ${e.name ? uiEsc(e.name) : e.recipe && uiState.recipesById.get(e.recipe) ? uiEsc(uiState.recipesById.get(e.recipe).name) : ''} ${e.text ? `<span class="muted">${uiEsc(e.text)}</span>` : ''}</div><button class="btn small danger" type="button" data-del="${uiEsc(e.logged_at || '')}|${uiEsc(e.date)}|${uiEsc(e.meal || '')}">Delete</button></div>
        <div class="small">${Object.entries(e.symptoms || {}).filter(([, v]) => v > 0).map(([k, v]) => `${uiEsc((LOG_SYMPTOMS.find(s => s.id === k) || { label: k }).label)}: ${LOG_LEVELS[v] || v}`).join(', ') || '<span class="muted">no symptoms recorded</span>'}</div>
        ${e.notes ? `<div class="small muted">${uiEsc(e.notes)}</div>` : ''}</div>`).join('')}
    </section>`).join('') : '<p class="empty">No entries in the last 14 days.</p>'}
    <p class="small muted">The log is a record for you and your clinician. The app does not analyze it or claim to find causes.</p>
  `;

  root.querySelector('#log-date').addEventListener('change', e => { d.date = e.target.value || today; d.recipe = ''; uiState.rerender(); });
  root.querySelector('#log-meal').addEventListener('change', e => { d.meal = e.target.value; });
  root.querySelector('#log-recipe').addEventListener('change', e => { d.recipe = e.target.value; });
  root.querySelector('#log-text').addEventListener('change', e => { d.text = e.target.value; uiState.rerender(); });
  root.querySelector('#log-notes').addEventListener('input', e => { d.notes = e.target.value; });
  root.querySelectorAll('[data-sym]').forEach(inp => inp.addEventListener('input', () => {
    d.symptoms[inp.dataset.sym] = Number(inp.value);
    inp.setAttribute('aria-valuetext', LOG_LEVELS[Number(inp.value)]);
    root.querySelector('#log-symval-' + inp.dataset.sym).textContent = LOG_LEVELS[Number(inp.value)];
  }));
  root.querySelector('#log-save').addEventListener('click', () => {
    d.text = root.querySelector('#log-text').value;
    d.notes = root.querySelector('#log-notes').value;
    const recipe = uiState.recipesById.get(d.recipe);
    const entry = { date: d.date, person: person.id, meal: d.meal, recipe: d.recipe || null, name: recipe ? recipe.name : null, text: d.text.trim() || null, symptoms: { ...d.symptoms }, notes: d.notes.trim() || null, logged_at: new Date().toISOString() };
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push(entry);
    uiPersist();
    logDraft = null;
    uiToast('Entry saved.');
    uiState.rerender();
  });
  root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
    if (!window.confirm('Delete this entry?')) return;
    const [logged, date, meal] = b.dataset.del.split('|');
    const idx = uiState.profile.log.findIndex(e => e.person === person.id && String(e.logged_at || '') === logged && e.date === date && String(e.meal || '') === meal);
    if (idx >= 0) uiState.profile.log.splice(idx, 1);
    uiPersist(); uiState.rerender();
  }));
}
