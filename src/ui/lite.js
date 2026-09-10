// Peace Meal for one (the lite shell): a Today screen built for one person and one minute a day, and the doctor report.
// Everything else (Meals, Recipes, Check, Learn, Breathe, setup) is the same code as the full app with fewer controls.
import { symptomEpisodes, foodsBeforeSymptoms, weightTrend, reportDays, intakeAverages, unintendedWeightLoss } from '../engine/report.js';
import { lbToKg, kgToLb } from '../engine/energy.js';
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiToast, uiModal, uiIsoDate, uiToday, uiFmtDate, uiFmtNum, uiPageHeader, uiSection, uiChip, uiIcon, uiEmptyState, uiNoticeHTML, uiTagLabel, uiSourcesHTML, uiDownload, uiSegmented } from './common.js';
import { todayAddDiaryEntry, todayAddModal, todayLatestWeightKg, todayChartSVG, todayShiftDate, todayEntryName, todayWeightLossNoticeHTML } from './today.js';
import { weekGet } from './week.js';
import { LOG_SYMPTOMS } from './log.js';
import { SLOT_LABEL } from '../engine/planner.js';

const LITE_LEVELS = [{ value: 1, label: 'Mild' }, { value: 2, label: 'Moderate' }, { value: 3, label: 'Bad' }];
const LITE_SLOT_TO_DIARY = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', 'snack-am': 'snacks', 'snack-pm': 'snacks', 'snack-eve': 'snacks' };

function liteSymptomLabel(id) { const s = LOG_SYMPTOMS.find(x => x.id === id); return s ? s.label : String(id).replace(/^custom:/, '').replace(/_/g, ' '); }
function liteCustomSymptoms(person) { return (person.custom_symptoms || []).map(s => ({ id: 'custom:' + s, label: s })); }

// ---------- Today ----------
export function renderLiteTodayScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const date = uiIsoDate(uiToday());
  const week = uiState.data.recipes.length ? weekGet(person, plan) : null;
  const day = week ? week.days.find(d => d.date === date) : null;
  const entries = (uiState.profile.diary || []).filter(e => e.person === person.id && e.date === date);
  const eps = symptomEpisodes(uiState.profile.log, person.id, date, date);
  const latestKg = todayLatestWeightKg(person);
  const dateLine = uiToday().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const slots = day ? day.meals.map(m => m.slot) : ['breakfast', 'lunch', 'snack-pm', 'dinner'];
  root.innerHTML = `
    ${uiPageHeader(`Hello, ${uiEsc(person.name)}`, dateLine, person.setup_complete ? '' : `<a class="btn small primary" href="#/people/${uiEsc(person.id)}/basics">Finish setup</a>`)}
    ${todayWeightLossNoticeHTML(person, date)}
    ${plan.notices.filter(n => n.code === 'suggest-module' || n.code === 'phase-check-in' || n.code === 'medication-flag').map(n => uiNoticeHTML(n, { person })).join('')}
    ${uiSection('What did you eat?', `<div class="lite-slots">${slots.map(slot => {
      const planned = day ? day.meals.find(m => m.slot === slot) : null;
      const logged = entries.filter(e => e.meal === LITE_SLOT_TO_DIARY[slot] || e.meal === slot);
      return `<div class="lite-slot card">
        <div class="lite-slot-head"><span class="slot">${SLOT_LABEL[slot] || slot}</span>${logged.length ? uiChip(`${logged.length} logged`, 'pass') : ''}</div>
        ${planned && planned.recipe ? `<p class="lite-planned">Planned: <strong>${uiEsc(planned.name)}</strong></p>` : '<p class="small muted">Nothing planned for this slot.</p>'}
        ${logged.length ? `<ul class="lite-logged">${logged.map(e => `<li>${uiEsc(todayEntryName(e))}</li>`).join('')}</ul>` : ''}
        <div class="btn-row">${planned && planned.recipe && !logged.some(e => e.ref === planned.recipe) ? `<button class="btn primary lite-big" type="button" data-ate="${uiEsc(slot)}">${uiIcon('check')}I ate this</button>` : ''}<button class="btn lite-big" type="button" data-other="${uiEsc(slot)}">${uiIcon('plus')}Something else</button></div>
      </div>`; }).join('')}</div>`, { id: 'lite-eat-h' })}
    ${uiSection('How do you feel?', `<div class="card">
      ${eps.length ? `<ul class="lite-logged">${eps.map(e => `<li><strong>${Object.entries(e.symptoms).filter(([, v]) => v > 0).map(([k, v]) => `${uiEsc(liteSymptomLabel(k))} (${LITE_LEVELS.find(l => l.value === Number(v)) ? LITE_LEVELS.find(l => l.value === Number(v)).label.toLowerCase() : v})`).join(', ')}</strong>${e.at && e.at.length > 10 ? ` <span class="muted small">at ${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>` : ''}${e.notes ? `<div class="small muted">${uiEsc(e.notes)}</div>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">Nothing logged today. If something comes on, tap the button and say what and how bad.</p>'}
      <div class="btn-row"><button class="btn primary lite-big" type="button" id="lite-feel">${uiIcon('note')}Log a symptom</button><button class="btn lite-big" type="button" id="lite-fine">${uiIcon('check-circle')}Feeling fine today</button></div>
    </div>`, { id: 'lite-feel-h' })}
    ${uiSection('Weight', `<div class="card"><div class="today-row"><div class="field"><label for="lite-weight">Today's weight (lb)</label><input id="lite-weight" type="number" inputmode="decimal" min="50" max="900" step="0.1" placeholder="${latestKg ? kgToLb(latestKg) : '150'}"></div><button class="btn primary lite-big" type="button" id="lite-weight-save">Save</button></div>
      <p class="small muted">${latestKg ? `Last logged: ${kgToLb(latestKg)} lb.` : 'No weight logged yet.'} ${person.goals && person.goals.calorie_target === 'gain' ? 'Your goal is to gain; the Report shows the trend.' : ''}</p></div>`, { id: 'lite-weight-h' })}
    ${uiSection('Also', `<div class="quick-actions">
      <a class="quick-action" href="#/check">${uiIcon('check-circle')}<span>Check a label</span><small>Is this product okay?</small></a>
      <a class="quick-action" href="#/report">${uiIcon('cite')}<span>Doctor report</span><small>Food, symptoms, weight</small></a>
      <a class="quick-action" href="#/breathe">${uiIcon('breathe')}<span>Breathe</span><small>A short visual reset</small></a>
      <a class="quick-action" href="#/plan">${uiIcon('list')}<span>My plan</span><small>What I avoid and why</small></a>
    </div>`, { id: 'lite-also-h' })}
    <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Any medical targets come from your doctor or dietitian, never from the app.</p>`;
  root.querySelectorAll('[data-ate]').forEach(b => b.addEventListener('click', () => {
    const slot = b.dataset.ate;
    const planned = day.meals.find(m => m.slot === slot);
    todayAddDiaryEntry(person, { date, meal: slot, kind: 'recipe', ref: planned.recipe, amount: 1, unit: 'serving' });
    uiToast(`Logged ${planned.name}.`); uiState.rerender();
  }));
  root.querySelectorAll('[data-other]').forEach(b => b.addEventListener('click', () => todayAddModal(person, plan, date, LITE_SLOT_TO_DIARY[b.dataset.other] || b.dataset.other)));
  root.querySelector('#lite-feel').addEventListener('click', () => liteSymptomModal(person, date));
  root.querySelector('#lite-fine').addEventListener('click', () => {
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push({ date, person: person.id, meal: 'day', recipe: null, name: null, text: null, symptoms: {}, notes: 'Feeling fine', fine: true, at: new Date().toISOString(), logged_at: new Date().toISOString() });
    uiPersist(); uiToast('Noted: feeling fine today. Good days count too.'); uiState.rerender();
  });
  root.querySelector('#lite-weight-save').addEventListener('click', () => {
    const lb = Number(root.querySelector('#lite-weight').value);
    const kg = lbToKg(lb);
    if (!kg) { uiToast('Enter a weight in pounds.'); return; }
    uiState.profile.weights = (uiState.profile.weights || []).filter(w => !(w.person === person.id && w.date === date));
    uiState.profile.weights.push({ date, person: person.id, kg });
    person.weight_kg = kg;
    uiPersist(); uiToast(`Saved ${lb} lb.`); uiState.rerender();
  });
}

function liteSymptomModal(person, date) {
  const list = [...LOG_SYMPTOMS.map(s => ({ id: s.id, label: s.label, help: s.help })), ...liteCustomSymptoms(person)];
  const state = { picked: {}, note: '', time: new Date().toTimeString().slice(0, 5) };
  const m = uiModal(`
    <p class="small muted">Tap everything you feel, then how bad. This goes on the doctor report with what you ate in the 24 hours before.</p>
    <div class="lite-symptoms">${list.map(s => `<button type="button" class="lite-sym" data-sym="${uiEsc(s.id)}" aria-pressed="false" title="${uiEsc(s.help || '')}">${uiEsc(s.label)}</button>`).join('')}</div>
    <div class="field"><label for="lite-sym-new">Something else</label><input id="lite-sym-new" type="text" placeholder="Type it and press Add" autocomplete="off"><div class="btn-row" style="margin-top:6px"><button class="btn small" type="button" id="lite-sym-add">Add</button></div></div>
    <div class="field"><span class="label">How bad?</span>${uiSegmented('lite-level', LITE_LEVELS, 2, { label: 'How bad' })}</div>
    <div class="field"><label for="lite-sym-time">When</label><input id="lite-sym-time" type="time" value="${state.time}" style="width:auto"></div>
    <div class="field"><label for="lite-sym-note">Note (optional)</label><input id="lite-sym-note" type="text" placeholder="Started an hour after lunch" autocomplete="off"></div>
    <div class="btn-row"><button class="btn primary lite-big" type="button" id="lite-sym-save">Save</button></div>`, { title: 'How do you feel?' });
  if (!m) return;
  let level = 2;
  const bind = () => m.el.querySelectorAll('[data-sym]').forEach(b => { b.onclick = () => { const id = b.dataset.sym; if (state.picked[id]) delete state.picked[id]; else state.picked[id] = true; b.classList.toggle('on', !!state.picked[id]); b.setAttribute('aria-pressed', String(!!state.picked[id])); }; });
  bind();
  m.el.querySelectorAll('[data-seg="lite-level"]').forEach(r => r.addEventListener('change', () => { level = Number(r.value); m.el.querySelectorAll('[data-seg="lite-level"]').forEach(x => x.parentElement.classList.toggle('on', x.checked)); }));
  m.el.querySelector('#lite-sym-add').addEventListener('click', () => {
    const v = m.el.querySelector('#lite-sym-new').value.trim();
    if (!v) return;
    person.custom_symptoms = person.custom_symptoms || [];
    if (!person.custom_symptoms.includes(v)) person.custom_symptoms.push(v);
    const id = 'custom:' + v;
    state.picked[id] = true;
    const wrap = m.el.querySelector('.lite-symptoms');
    wrap.insertAdjacentHTML('beforeend', `<button type="button" class="lite-sym on" data-sym="${uiEsc(id)}" aria-pressed="true">${uiEsc(v)}</button>`);
    m.el.querySelector('#lite-sym-new').value = '';
    bind(); uiPersist();
  });
  m.el.querySelector('#lite-sym-save').addEventListener('click', () => {
    const ids = Object.keys(state.picked);
    if (!ids.length) { uiToast('Tap at least one symptom, or use "Feeling fine today".'); return; }
    const time = m.el.querySelector('#lite-sym-time').value || '12:00';
    const at = new Date(date + 'T' + time + ':00').toISOString();
    const symptoms = {}; for (const id of ids) symptoms[id] = level;
    uiState.profile.log = uiState.profile.log || [];
    uiState.profile.log.push({ date, person: person.id, meal: 'symptom', recipe: null, name: null, text: null, symptoms, notes: m.el.querySelector('#lite-sym-note').value.trim() || null, at, logged_at: new Date().toISOString() });
    uiPersist(); m.close(); uiToast('Saved. It will show on the doctor report with what you ate before it.'); uiState.rerender();
  });
}

// ---------- Doctor report ----------
let liteReportUi = { days: 30, mode: 'all' };

export function renderLiteReportScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const to = uiIsoDate(uiToday());
  const from = todayShiftDate(to, -(liteReportUi.days - 1));
  const onlySym = liteReportUi.mode === 'symptoms';
  const days = reportDays({ diary: uiState.profile.diary, log: uiState.profile.log, weights: uiState.profile.weights, personId: person.id, from, to, onlySymptomDays: onlySym });
  const eps = symptomEpisodes(uiState.profile.log, person.id, from, to);
  const foods = foodsBeforeSymptoms(uiState.profile.diary, uiState.profile.log, person.id, from, to, 24).slice(0, 10);
  const wt = weightTrend(uiState.profile.weights, person.id, from, to);
  const avoid = Object.entries(plan.avoid || {}).sort(([, a], [, b]) => Number(b.hard) - Number(a.hard));
  const meds = [];
  for (const mod of uiState.conditionsById.values()) for (const q of mod.medication_questions || []) if (person.medications && person.medications[q.id] && !meds.some(m => m.id === q.id)) meds.push({ id: q.id, text: q.text });
  const intake = intakeAverages(uiState.profile.diary, person.id, from, to);
  const wl = unintendedWeightLoss(uiState.profile.weights, person.id, to, { intended: !!(person.goals && person.goals.calorie_target === 'loss') });
  const intakeRows = [['kcal', 'Calories', ''], ['protein_g', 'Protein', 'g'], ['carb_g', 'Carbohydrate', 'g'], ['fat_g', 'Fat', 'g'], ['fiber_g', 'Fiber', 'g'], ['sodium_mg', 'Sodium', 'mg'], ['potassium_mg', 'Potassium', 'mg']];
  const body = `
    <div class="report-sheet" id="lite-report">
      <h1 class="report-title">Food and symptom report</h1>
      <p class="report-meta">${uiEsc(person.name)}${person.age ? `, age ${person.age}` : ''}. ${uiFmtDate(from)} to ${uiFmtDate(to)} (${liteReportUi.days} days)${onlySym ? ', days with symptoms only' : ', full diary'}. Printed from Peace Meal on ${uiFmtDate(to)}. Self-reported by the patient; the app records, it does not diagnose.</p>
      <h2>Current restrictions</h2>
      ${(person.allergens || []).length ? `<p class="small"><strong>Allergies (never):</strong> ${person.allergens.map(uiTagLabel).map(uiEsc).join(', ')}.</p>` : ''}
      ${plan.modules.length ? `<ul class="report-list">${plan.modules.map(m => { const mod = uiState.conditionsById.get(m.id); const hard = avoid.filter(([, a]) => a.hard && a.rules.some(r => r.module === m.id)).map(([t]) => uiTagLabel(t)); const soft = avoid.filter(([, a]) => !a.hard && a.rules.some(r => r.module === m.id)).map(([t]) => uiTagLabel(t)); const srcs = [...new Set(avoid.flatMap(([, a]) => a.rules.filter(r => r.module === m.id).flatMap(r => r.sources || [])).concat((mod && mod.sources) || []))].slice(0, 2); return `<li><strong>${uiEsc(m.name)}</strong>${hard.length ? `. Never: ${hard.map(uiEsc).join(', ')}` : ''}${soft.length ? `. Avoid: ${soft.map(uiEsc).join(', ')}` : ''}${!hard.length && !soft.length ? '. Guidance only, no foods excluded' : ''}.${srcs.length ? ` <span class="small muted">${uiSourcesHTML(srcs)}</span>` : ''}</li>`; }).join('')}</ul>` : '<p class="small muted">No conditions selected.</p>'}
      ${Object.keys(plan.limits || {}).length ? `<p class="small"><strong>Daily limits:</strong> ${Object.entries(plan.limits).map(([n, l]) => `${uiEsc(n.replace(/_/g, ' '))} at most ${uiFmtNum(l.value, 1)}`).join('; ')}.</p>` : ''}
      <h2>Weight</h2>
      ${wt.points.length ? `<p class="small">${wt.points.length} entr${wt.points.length === 1 ? 'y' : 'ies'}. ${kgToLb(wt.first.kg)} lb on ${uiFmtDate(wt.first.date)} to ${kgToLb(wt.last.kg)} lb on ${uiFmtDate(wt.last.date)}: <strong>${wt.changeKg > 0 ? '+' : ''}${kgToLb(Math.abs(wt.changeKg)) * Math.sign(wt.changeKg) || 0} lb</strong>.${person.goals && person.goals.calorie_target === 'gain' ? ' Goal: gain.' : ''}</p>${wt.points.length > 1 ? todayChartSVG(wt.points) : ''}` : '<p class="small muted">No weights logged in this range.</p>'}
      ${wl ? `<p class="small"><strong>Weight loss flag:</strong> down ${wl.pct}% between ${uiFmtDate(wl.fromDate)} and ${uiFmtDate(wl.toDate)} (${wl.weeks} weeks) with no weight-loss goal set. This meets the GLIM screening threshold for unintended weight loss (more than ${wl.threshold}% over this span).</p>` : ''}
      <h2>Medicines that change the food rules</h2>
      ${meds.length ? `<ul class="report-list">${meds.map(m => `<li>Yes: ${uiEsc(m.text)}</li>`).join('')}</ul>` : '<p class="small muted">None answered yes.</p>'}
      <h2>Average daily intake</h2>
      ${intake.days ? `<p class="small muted">Averaged over the ${intake.days} day${intake.days === 1 ? '' : 's'} in this range with food logged. Amounts come from USDA values by grams or a recipe's published per-serving numbers; anything logged without numbers is not counted.</p>
      <table class="report-table"><thead><tr><th>Nutrient</th><th class="num">Average per day</th><th class="num">Daily limit in the plan</th></tr></thead><tbody>${intakeRows.map(([k, label, unit]) => `<tr><td>${label}</td><td class="num">${typeof intake.avg[k] === 'number' ? uiFmtNum(Math.round(intake.avg[k])) + (unit ? ' ' + unit : '') : '-'}</td><td class="num">${plan.limits && plan.limits[k] ? uiFmtNum(plan.limits[k].value) + (unit ? ' ' + unit : '') : '-'}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">No food logged in this range.</p>'}
      <h2>Symptoms: ${eps.length} episode${eps.length === 1 ? '' : 's'}</h2>
      ${eps.length ? `<p class="small">Most frequent: ${liteTopSymptoms(eps).map(([id, n]) => `${uiEsc(liteSymptomLabel(id))} (${n})`).join(', ')}.</p>` : '<p class="small muted">None logged in this range.</p>'}
      ${foods.length ? `<h2>Foods eaten in the 24 hours before symptoms</h2>
      <p class="small muted">Counts only, and an association is not a cause. A food eaten every day shows up before everything, and a food that appears before most episodes still needs a supervised trial off and back on before anyone calls it a trigger.</p>
      <table class="report-table"><thead><tr><th>Food or meal</th><th class="num">Before episodes</th><th class="num">Times eaten</th></tr></thead><tbody>${foods.map(f => `<tr><td>${uiEsc(f.name)}</td><td class="num">${f.episodes} of ${eps.length}</td><td class="num">${f.total}</td></tr>`).join('')}</tbody></table>` : ''}
      <h2>${onlySym ? 'Days with symptoms' : 'Day by day'}</h2>
      ${days.length ? days.map(d => `<div class="report-day">
        <h3>${uiEsc(uiFmtDate(d.date))}${d.weight ? ` <span class="muted small">${kgToLb(d.weight.kg)} lb</span>` : ''}</h3>
        ${d.episodes.length ? `<ul class="report-list sym">${d.episodes.map(e => `<li><strong>${Object.entries(e.symptoms).filter(([, v]) => v > 0).map(([k, v]) => `${uiEsc(liteSymptomLabel(k))} (${['', 'mild', 'moderate', 'bad'][Number(v)] || v})`).join(', ')}</strong>${e.at && e.at.length > 10 ? ` at ${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}${e.name ? ` after ${uiEsc(e.name)}` : ''}${e.notes ? `. ${uiEsc(e.notes)}` : ''}</li>`).join('')}</ul>` : (uiState.profile.log || []).some(l => l.person === person.id && l.date === d.date && l.fine) ? '<p class="small muted">Feeling fine.</p>' : ''}
        ${d.eaten.length ? `<p class="small">${['breakfast', 'lunch', 'snacks', 'dinner'].map(meal => { const es = d.eaten.filter(e => e.meal === meal); return es.length ? `<strong>${meal[0].toUpperCase() + meal.slice(1)}:</strong> ${es.map(e => uiEsc(todayEntryName(e))).join(', ')}` : ''; }).filter(Boolean).join(' · ')}</p>` : '<p class="small muted">Nothing logged.</p>'}
      </div>`).join('') : '<p class="small muted">Nothing in this range.</p>'}
    </div>`;
  root.innerHTML = `
    ${uiPageHeader('Doctor report', 'What you ate, how you felt, and your weight, ready to print or send. Nothing leaves this device unless you send it.', `<button class="btn small primary" type="button" id="lite-print">${uiIcon('cite')}Print</button><button class="btn small" type="button" id="lite-export">${uiIcon('share')}Save as file</button>`)}
    <div class="card tight"><div class="row">
      <div class="field" style="margin:0"><span class="label">Range</span>${uiSegmented('lite-range', [{ value: 7, label: '7 days' }, { value: 14, label: '14 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }], liteReportUi.days, { label: 'Range' })}</div>
      <div class="field" style="margin:0"><span class="label">Include</span>${uiSegmented('lite-mode', [{ value: 'all', label: 'Full diary' }, { value: 'symptoms', label: 'Only days with symptoms' }], liteReportUi.mode, { label: 'Include' })}</div>
    </div></div>
    ${body}`;
  root.querySelectorAll('[data-seg="lite-range"]').forEach(r => r.addEventListener('change', () => { liteReportUi.days = Number(r.value); uiState.rerender(); }));
  root.querySelectorAll('[data-seg="lite-mode"]').forEach(r => r.addEventListener('change', () => { liteReportUi.mode = r.value; uiState.rerender(); }));
  root.querySelector('#lite-print').addEventListener('click', () => { root.classList.add('print-report'); window.print(); setTimeout(() => root.classList.remove('print-report'), 1000); });
  root.querySelector('#lite-export').addEventListener('click', () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Food and symptom report for ${uiEsc(person.name)}</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:760px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:17px;margin-top:22px}h3{font-size:15px;margin:14px 0 4px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}.num{text-align:right}.small{font-size:13px}.muted{color:#555}.chart{max-width:420px}.chart text{font-size:11px;fill:#555}.chart .axis,.chart .grid{stroke:#ccc}.chart .line{stroke:#3D5A3C;fill:none;stroke-width:2}.chart .pt{fill:#3D5A3C}ul{padding-left:18px}</style></head><body>${root.querySelector('#lite-report').innerHTML}</body></html>`;
    const ok = uiDownload(`food-symptom-report-${person.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${to}.html`, html, 'text/html');
    uiToast(ok ? 'Report saved. Attach it to an email to your doctor.' : 'Download blocked here. Use Print instead.');
  });
}
function liteTopSymptoms(eps) {
  const c = new Map();
  for (const e of eps) for (const [k, v] of Object.entries(e.symptoms)) if (v > 0) c.set(k, (c.get(k) || 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}
