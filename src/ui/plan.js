// Plan: the merged plan for the active person, section by section, every rule with its sources.
import { uiState, uiEsc, uiActivePerson, uiPlanFor, uiPersist, uiRulesList, uiSourcesDisclosure, uiTagLabel, uiNutrientLabel, uiFmtNum, uiIsoDate, uiToday, uiModuleName, uiNoticeHTML, uiBindNoticeActions, uiToast } from './common.js';

export function renderPlanScreen(root) {
  const person = uiActivePerson();
  const plan = uiPlanFor(person);
  const limits = Object.entries(plan.limits);
  const targets = Object.entries(plan.targets);
  const avoidHard = Object.entries(plan.avoid).filter(([, v]) => v.hard);
  const avoidSoft = Object.entries(plan.avoid).filter(([, v]) => !v.hard);
  const prefer = Object.entries(plan.prefer);

  const numberRows = planNumberRows(limits, targets);
  const periodic = Object.entries(plan.periodic || {}).map(([per, x]) => ({ per, rows: planNumberRows(Object.entries(x.limits || {}), Object.entries(x.targets || {})) })).filter(x => x.rows.length);

  root.innerHTML = `
    <h1>Plan for ${uiEsc(person.name)}</h1>
    <p class="muted">Modules: ${plan.modules.length ? plan.modules.map(m => `<span class="badge gray outline">${uiEsc(m.name)}</span>`).join(' ') : 'none selected'}. ${plan.disabledModules.length ? `Turned off: ${plan.disabledModules.map(d => `<span class="badge red outline">${uiEsc(uiModuleName(d.id))}</span>`).join(' ')}.` : ''}</p>
    ${plan.notices.filter(n => n.level === 'block').map(n => uiNoticeHTML(n, { person })).join('')}

    <h2 id="plan-numbers">Numbers</h2>
    <h3>Per day</h3>
    ${numberRows.length ? planNumbersTable(numberRows) : '<p class="empty">No daily limits or targets are active. Numbers appear when a module carries one, or when a clinician number is entered.</p>'}
    ${periodic.map(x => `<h3>Per ${uiEsc(x.per)}</h3>${planNumbersTable(x.rows)}`).join('')}

    <h2>Avoid</h2>
    <h3>Hard stops</h3>
    ${avoidHard.length ? avoidHard.map(([tag, v]) => planTagCard(tag, v, 'red')).join('') : '<p class="muted small">None.</p>'}
    <h3>Soft (caution)</h3>
    ${avoidSoft.length ? avoidSoft.map(([tag, v]) => planTagCard(tag, v, 'amber')).join('') : '<p class="muted small">None.</p>'}

    <h2>Prefer</h2>
    ${prefer.length ? prefer.map(([tag, v]) => planTagCard(tag, v, 'green')).join('') : '<p class="muted small">None.</p>'}

    <h2>Timing</h2>
    <div class="card">${uiRulesList(plan.timing)}</div>

    <h2>Habits</h2>
    <div class="card">${uiRulesList(plan.behavior)}</div>

    ${plan.info.length ? `<h2>Information and pending rules</h2><div class="card">${uiRulesList(plan.info)}</div>` : ''}

    <h2>Conflicts</h2>
    ${plan.conflicts.length ? plan.conflicts.map(c => `<div class="card tight">
        <div class="row"><strong>${uiEsc(c.aName)}</strong> <span class="muted">and</span> <strong>${uiEsc(c.bName)}</strong> ${planConflictBadge(c)}</div>
        <div class="small muted">Type: ${uiEsc(c.type)}${c.param ? `, about ${uiEsc(uiNutrientLabel(c.param))}` : ''}. Resolution: ${uiEsc(c.resolution)}.</div>
        <div>${uiEsc(c.text)}</div>
        ${c.status === 'needs-ack' ? `<button class="btn small" type="button" data-ack="${uiEsc(c.ackKey)}">I understand</button>` : ''}
      </div>`).join('') : '<p class="muted small">No conflicts between the selected modules.</p>'}

    <h2>Phases</h2>
    ${plan.phases.length ? plan.phases.map(ph => `<div class="card tight">
        <div class="row"><strong>${uiEsc(ph.moduleName)}</strong> <span class="badge blue">${uiEsc(ph.label)}</span> ${ph.status === 'expired' ? '<span class="badge red">expired</span>' : ph.status === 'ready-to-advance' ? '<span class="badge green">ready to advance</span>' : '<span class="badge gray">active</span>'}</div>
        <div class="small muted">Started ${uiEsc(ph.started)}. ${ph.weeks} weeks elapsed. ${ph.min_weeks ? `Minimum ${ph.min_weeks} weeks.` : ''} ${ph.max_weeks ? `Maximum ${ph.max_weeks} weeks.` : ''}</div>
        <div class="btn-row">
          ${ph.next ? `<button class="btn small primary" type="button" data-phase-next="${uiEsc(ph.module)}" data-next="${uiEsc(ph.next)}">Move to ${uiEsc(ph.nextLabel)}</button>` : '<span class="small muted">Final phase.</span>'}
          <button class="btn small" type="button" data-phase-restart="${uiEsc(ph.module)}" data-phase="${uiEsc(ph.phase)}">Restart phase</button>
        </div>
      </div>`).join('') : '<p class="muted small">No time-limited protocols are active.</p>'}

    <h2>Modes</h2>
    ${plan.modes.length ? plan.modes.map(md => planModeCard(md, person)).join('') : '<p class="muted small">No two-mode conditions are active.</p>'}

    <h2>Set aside</h2>
    ${plan.suppressed.length ? `<div class="card">${plan.suppressed.map(s => `<div class="rule"><div class="rule-text">${uiEsc(s.text || s.rule)}</div><div class="rule-meta"><span class="badge gray outline">${uiEsc(s.moduleName || uiModuleName(s.module))}</span><span>${uiEsc(planSuppressReason(s))}</span></div>${s.sources && s.sources.length ? uiSourcesDisclosure(s.sources, !!s.verify) : ''}</div>`).join('')}</div>` : '<p class="muted small">Nothing was set aside.</p>'}

    <h2>Clinician numbers still missing</h2>
    ${plan.tier2.missing.length ? `<div class="card">${plan.tier2.missing.map(t => `<div class="rule"><div class="rule-text"><strong>${uiEsc(t.label)}</strong> <span class="badge amber">not applied</span></div><div class="small muted">${uiEsc(t.moduleName)}. ${t.consensus ? 'Published range: ' + uiEsc(t.consensus) + '.' : ''} ${uiEsc(t.why || '')}</div></div>`).join('')}
      <div class="btn-row"><a class="btn primary" href="#/people/${uiEsc(person.id)}/clinician">Enter clinician numbers</a></div></div>` : '<p class="muted small">None. Every Tier 2 rule either has a number or does not apply.</p>'}

    <h2>Restriction load</h2>
    <div class="card tight">
      <div class="row"><strong>${plan.restrictionLoad.count} elimination-style restriction${plan.restrictionLoad.count === 1 ? '' : 's'}</strong> ${plan.restrictionLoad.warn ? '<span class="badge amber">check in</span>' : '<span class="badge green">ok</span>'}</div>
      ${plan.restrictionLoad.modules.length ? `<div class="small muted">${plan.restrictionLoad.modules.map(m => uiEsc(uiModuleName(m))).join(', ')}</div>` : ''}
      ${plan.restrictionLoad.warn ? '<p class="small" style="margin-top:.5rem">Three or more at once is a lot of restriction. The guidelines behind these protocols warn about it. Do one elimination at a time where you can, and consider a dietitian.</p>' : ''}
    </div>
    <p class="small muted" style="margin-top:1.5rem">Every rule above is shown with its source. A rule marked VERIFY carries a citation that was not confirmed against a primary source and should be checked before the number is trusted.</p>
  `;

  uiBindNoticeActions(root, person);
  root.querySelectorAll('[data-phase-next]').forEach(b => b.addEventListener('click', () => {
    person.phases = person.phases || {};
    person.phases[b.dataset.phaseNext] = { phase: b.dataset.next, started: uiIsoDate(uiToday()) };
    uiPersist(); uiToast('Phase updated.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-phase-restart]').forEach(b => b.addEventListener('click', () => {
    if (!window.confirm('Restart this phase from today?')) return;
    person.phases = person.phases || {};
    person.phases[b.dataset.phaseRestart] = { phase: b.dataset.phase, started: uiIsoDate(uiToday()) };
    uiPersist(); uiToast('Phase restarted.'); uiState.rerender();
  }));
  root.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
    person.modes = person.modes || {};
    const mode = b.dataset.mode;
    const mod = uiState.conditionsById.get(b.dataset.module);
    const def = mod && mod.modes ? (mod.modes.find(x => x.id === mode) || {}) : {};
    person.modes[b.dataset.module] = def.expires_days ? { mode, since: uiIsoDate(uiToday()) } : mode;
    uiPersist(); uiToast('Mode changed.'); uiState.rerender();
  }));
}

function planNumberRows(limits, targets) {
  return [
    ...limits.map(([n, l]) => ({ nutrient: n, kind: 'Limit', value: `at most ${uiFmtNum(l.value, 1)}${l.unit === 'percent_kcal' ? '%' : ''}`, ideal: l.ideal != null ? `ideally ${uiFmtNum(l.ideal, 1)}` : '', per: l.per, clinician: l.clinician, rules: l.rules })),
    ...targets.map(([n, t]) => ({ nutrient: n, kind: 'Target', value: `at least ${uiFmtNum(t.min, 1)}${t.max != null ? `, at most ${uiFmtNum(t.max, 1)}` : ''}${t.unit === 'percent_kcal' ? '%' : ''}`, ideal: '', per: t.per, clinician: t.clinician, rules: t.rules }))
  ];
}
function planNumbersTable(rows) {
  return `<div class="table-wrap"><table>
      <thead><tr><th>Nutrient</th><th>Kind</th><th>Value</th><th>Ideal</th><th>Per</th><th>Set by</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><strong>${uiEsc(uiNutrientLabel(r.nutrient))}</strong></td><td>${r.kind}</td><td class="num">${uiEsc(r.value)}</td><td>${uiEsc(r.ideal)}</td><td>${uiEsc(r.per)}</td><td>${r.clinician ? '<span class="badge blue">clinician-set</span>' : '<span class="small muted">guideline</span>'}</td></tr>
        <tr><td colspan="6" style="padding-top:0"><details><summary>Rules behind this (${r.rules.length})</summary>${uiRulesList(r.rules)}</details></td></tr>`).join('')}</tbody></table></div>`;
}

function planTagCard(tag, v, color) {
  const def = uiState.matcher ? uiState.matcher.tagDef(tag) : null;
  return `<div class="card tight">
    <div class="row"><strong>${uiEsc(uiTagLabel(tag))}</strong> <span class="badge ${color}">${color === 'red' ? 'hard stop' : color === 'amber' ? 'soft' : 'prefer'}</span> <code class="small muted">${uiEsc(tag)}</code></div>
    ${def && def.description ? `<div class="small muted">${uiEsc(def.description)}</div>` : ''}
    <details><summary>Rules behind this (${v.rules.length})</summary>${uiRulesList(v.rules)}</details>
  </div>`;
}

function planConflictBadge(c) {
  const map = { blocked: ['red', 'hard conflict, no number set'], suppressed: ['amber', 'one side set aside'], winner: ['amber', 'one side wins'], 'time-limited': ['blue', 'time-limited'], 'needs-ack': ['amber', 'needs your acknowledgment'], acknowledged: ['gray', 'acknowledged'], pairing: ['blue', 'pairing advice'], compatible: ['green', 'compatible'], subsumed: ['gray', 'subsumed'], info: ['gray', 'info'] };
  const [cls, word] = map[c.status] || ['gray', c.status];
  return `<span class="badge ${cls}">${uiEsc(word)}</span>`;
}

function planModeCard(md, person) {
  const mod = uiState.conditionsById.get(md.module);
  const modes = (mod && mod.modes) || [];
  const stored = (person.modes || {})[md.module];
  const since = stored && typeof stored === 'object' ? stored.since : null;
  return `<div class="card tight">
    <div class="row"><strong>${uiEsc(mod ? mod.name : md.module)}</strong> <span class="badge blue">${uiEsc(md.mode)}</span>${since && stored.mode === md.mode ? `<span class="small muted">since ${uiEsc(since)}</span>` : ''}</div>
    <div class="btn-row">${modes.map(x => `<button class="btn small ${x.id === md.mode ? 'primary' : ''}" type="button" data-mode="${uiEsc(x.id)}" data-module="${uiEsc(md.module)}" ${x.id === md.mode ? 'aria-pressed="true"' : ''}>${uiEsc(x.label || x.id)}${x.expires_days ? ` (${x.expires_days}-day check-in)` : ''}</button>`).join('')}</div>
  </div>`;
}

function planSuppressReason(s) {
  const r = s.reason || {};
  switch (r.reason) {
    case 'medication': return `Set aside because you answered yes to: "${r.text}"`;
    case 'conflict': return `Set aside because ${uiModuleName(r.by)} takes precedence on this number.`;
    case 'hard-conflict': return `Set aside: hard conflict with ${uiModuleName(r.with)}. A clinician number resolves it.`;
    case 'feature-disabled': return `Set aside because ${String(r.feature).replace(/-/g, ' ')} is turned off for this profile.`;
    case 'winner': return `Set aside while ${uiModuleName(r.by)} rules apply.`;
    case 'screen': return 'Set aside because of the screening result.';
    case 'clinician-number-governs': return `Set aside: your clinician's number (${String(r.param || '').replace(/_/g, ' ')}) governs this nutrient.`;
    default: return 'Set aside.';
  }
}
