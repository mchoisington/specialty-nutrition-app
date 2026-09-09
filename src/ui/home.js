// Home: greeting, plan summary tiles, notices, "today so far" ring, quick actions. Also the Welcome screen (no people yet).
import { uiState, uiEsc, uiActivePerson, uiSetActive, uiPlanFor, uiNoticeHTML, uiBindNoticeActions, uiIcon, uiBrandMark, uiPageHeader, uiSection, uiStatTile, uiRing, uiGreeting, uiFmtNum, uiIsoDate, uiToday } from './common.js';
import { todayTargetInfo } from './today.js';

export function renderWelcomeScreen(root) {
  root.innerHTML = `
    <section class="welcome" aria-labelledby="welcome-h">
      ${uiBrandMark({ label: 'Peace Meal' })}
      <div>
        <h1 id="welcome-h">Peace Meal</h1>
        <p class="welcome-lede">One table, everyone's rules, every rule cited.</p>
      </div>
      <ul class="welcome-points">
        <li>${uiIcon('people')}<span>One plan per person: conditions, allergies, and preferences merged into a single set of rules.</span></li>
        <li>${uiIcon('cite')}<span>Every rule shows its source and evidence rating. Numbers come from data, never from guesswork.</span></li>
        <li>${uiIcon('leaf')}<span>A week of meals that fits your time and kitchen, checked against every plan at the table.</span></li>
      </ul>
      <a class="btn primary big" href="#/people/new">Set up the first person</a>
      <p class="small muted">Everything stays on this device. Nothing is sent anywhere.</p>
    </section>`;
}

function homeTodayRing(person, plan) {
  const today = uiIsoDate(uiToday());
  const entries = (uiState.profile.diary || []).filter(e => e.person === person.id && e.date === today);
  let kcal = 0, sodium = 0;
  for (const e of entries) { kcal += (e.nutrients && e.nutrients.kcal) || 0; sodium += (e.nutrients && e.nutrients.sodium_mg) || 0; }
  const info = todayTargetInfo(person, plan);
  const count = !!(person.goals && person.goals.count_exercise);
  const exerciseKcal = count ? (uiState.profile.exercise || []).filter(e => e.person === person.id && e.date === today).reduce((s, e) => s + (Number(e.kcal) || 0), 0) : 0;
  let ring, text;
  if (info.state === 'ok' && info.kcal > 0) {
    const target = info.kcal + exerciseKcal;
    ring = uiRing({ value: kcal, max: target, kind: 'kcal', unit: 'kcal', label: `of ${uiFmtNum(target)} kcal target`, href: '#/today', size: 120 });
    text = `<p><strong>${uiFmtNum(kcal)} kcal</strong> logged so far against an estimated target of ${uiFmtNum(target)}.</p><p class="small muted">${entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} today.` : 'Nothing logged yet today.'} The target is an estimate, not a prescription.</p>`;
  } else if (plan.limits.sodium_mg) {
    const lim = plan.limits.sodium_mg.value;
    ring = uiRing({ value: sodium, max: lim, kind: 'limit', unit: 'mg', label: `sodium of ${uiFmtNum(lim)} mg limit`, href: '#/today', size: 120 });
    text = `<p><strong>${uiFmtNum(sodium)} mg sodium</strong> logged so far against a limit of ${uiFmtNum(lim)} mg.</p><p class="small muted">${entries.length ? `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} today, ${uiFmtNum(kcal)} kcal.` : 'Nothing logged yet today.'}${plan.limits.sodium_mg.clinician ? ' Limit set by your clinician.' : ''}</p>`;
  } else {
    ring = '';
    text = `<p><strong>${uiFmtNum(kcal)} kcal</strong> logged so far.</p><p class="small muted">No calorie target or sodium limit is active, so there is no ring to fill. ${info.state === 'off' ? '<a href="#/today">Set a calorie target</a> if you want one.' : ''}</p>`;
  }
  return `<div class="card"><div class="ring-row">${ring}<div class="ring-text">${text}<a class="btn small" href="#/today">${uiIcon('clock')}Open Today</a></div></div></div>`;
}

export function renderHomeScreen(root) {
  const person = uiActivePerson();
  const people = uiState.profile.people;
  const plan = uiPlanFor(person);
  const notices = plan ? plan.notices : [];
  const blocks = notices.filter(n => n.level === 'block');
  const warns = notices.filter(n => n.level === 'warn');
  const infos = notices.filter(n => n.level === 'info');
  const hard = Object.values(plan.avoid || {}).filter(v => v.hard).length;
  const numbers = Object.keys(plan.limits || {}).length + Object.keys(plan.targets || {}).length;
  const missing = (plan.tier2 && plan.tier2.missing || []).length;
  const dateLine = uiToday().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const actions = `${people.length > 1 ? `<label class="visually-hidden" for="home-person">Active person</label><select id="home-person" style="width:auto">${people.map(p => `<option value="${uiEsc(p.id)}" ${p.id === person.id ? 'selected' : ''}>${uiEsc(p.name)}</option>`).join('')}</select>` : ''}
    ${person.setup_complete ? `<a class="btn small" href="#/people/${uiEsc(person.id)}/basics">${uiIcon('edit')}Edit profile</a>` : `<a class="btn small primary" href="#/people/${uiEsc(person.id)}/basics">Finish setup</a>`}`;

  root.innerHTML = `
    ${uiPageHeader(uiGreeting(person.name), `${dateLine}. ${plan.modules.length ? plan.modules.map(m => uiEsc(m.name)).join(', ') + '.' : 'No conditions or patterns selected yet.'}${(person.allergens || []).length ? ` ${person.allergens.length} allergen${person.allergens.length > 1 ? 's' : ''} on file.` : ''}`, actions)}
    ${person.setup_complete ? '' : uiNoticeHTML({ level: 'warn', text: 'Setup is not finished. The plan is built from what has been entered so far.' })}
    <div class="tiles" aria-label="Plan summary">
      ${uiStatTile({ value: uiFmtNum((plan.applied || []).length), label: 'Rules applied', note: `${plan.modules.length} module${plan.modules.length === 1 ? '' : 's'}`, href: '#/plan' })}
      ${uiStatTile({ value: uiFmtNum(hard), label: 'Hard exclusions', note: hard ? 'never overridden' : 'none', tone: hard ? 'stop' : '', href: '#/plan' })}
      ${missing ? uiStatTile({ value: uiFmtNum(missing), label: 'Clinician numbers missing', note: 'not applied yet', tone: 'caution', href: `#/people/${uiEsc(person.id)}/clinician` }) : uiStatTile({ value: uiFmtNum(numbers), label: 'Numbers set', note: numbers ? 'limits and targets' : 'none active', href: '#/plan' })}
    </div>
    ${uiSection('Notices', notices.length ? `<div class="stack" id="home-notices">${blocks.map(n => uiNoticeHTML(n, { person })).join('')}${warns.map(n => uiNoticeHTML(n, { person })).join('')}${infos.map(n => uiNoticeHTML(n, { person })).join('')}</div>` : '<p class="muted">No notices. The plan built without conflicts or missing numbers.</p>', { id: 'home-notices-h' })}
    ${uiSection('Today so far', homeTodayRing(person, plan), { id: 'home-today-h' })}
    ${uiSection('Quick actions', `<div class="quick-actions">
      <a class="quick-action" href="#/check">${uiIcon('check-circle')}<span>Check a food</span><small>Paste an ingredient list</small></a>
      <a class="quick-action" href="#/week">${uiIcon('calendar')}<span>Plan this week</span><small>Meals that fit your time</small></a>
      <a class="quick-action" href="#/grocery">${uiIcon('cart')}<span>Grocery list</span><small>From this week's meals</small></a>
      <a class="quick-action" href="#/breathe">${uiIcon('breathe')}<span>Breathe</span><small>A short visual reset</small></a>
    </div>`, { id: 'home-actions-h' })}
    <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</p>
  `;

  const sel = root.querySelector('#home-person');
  if (sel) sel.addEventListener('change', () => { uiSetActive(sel.value); uiState.rerender(); });
  uiBindNoticeActions(root, person);
}
