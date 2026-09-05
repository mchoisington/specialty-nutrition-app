// Shared UI state and helpers. Every screen module imports from here.
// Names are prefixed with "ui" so nothing collides when tools/bundle.mjs concatenates all modules into one scope.
import { save } from '../store.js';
import { buildPlan, labelNutrient } from '../engine/plan.js';

export const uiState = {
  profile: null,
  data: { sources: [], conditions: [], dictionaries: { tags: {}, entries: [] }, foods: [], recipes: [] },
  dataProblems: [],
  matcher: null,
  conditionsById: new Map(),
  sourcesById: new Map(),
  foodsById: new Map(),
  recipesById: new Map(),
  planCache: new Map(),
  weekCache: new Map(),
  route: { screen: 'home', parts: [] },
  rerender: () => {},
  version: '1.0.0'
};

export const UI_ALLERGENS = [
  { tag: 'allergen-milk', label: 'Milk' },
  { tag: 'allergen-egg', label: 'Egg' },
  { tag: 'allergen-fish', label: 'Fish' },
  { tag: 'allergen-crustacean', label: 'Crustacean shellfish' },
  { tag: 'allergen-tree-nut', label: 'Tree nuts' },
  { tag: 'allergen-peanut', label: 'Peanuts' },
  { tag: 'allergen-wheat', label: 'Wheat' },
  { tag: 'allergen-soy', label: 'Soybeans' },
  { tag: 'allergen-sesame', label: 'Sesame' }
];

export function uiEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function uiToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function uiIsoDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const day = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${day}`;
}
export function uiFmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function uiFmtNum(v, digits = 0) {
  if (v == null || Number.isNaN(v)) return '';
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function uiPersist() {
  uiState.planCache.clear();
  uiState.weekCache.clear();
  save(uiState.profile);
}

export function uiActivePerson() {
  const p = uiState.profile;
  if (!p || !p.people.length) return null;
  return p.people.find(x => x.id === p.activePerson) || p.people[0];
}
export function uiSetActive(id) {
  uiState.profile.activePerson = id;
  uiPersist();
}

export function uiPlanFor(person) {
  if (!person) return null;
  const key = person.id + '|' + JSON.stringify(person) + '|' + uiIsoDate();
  if (uiState.planCache.has(key)) return uiState.planCache.get(key);
  const plan = buildPlan({ person, conditions: uiState.data.conditions, dictionaries: uiState.data.dictionaries, today: uiToday() });
  uiState.planCache.clear();
  uiState.planCache.set(key, plan);
  return plan;
}

export function uiTagLabel(tag) {
  return uiState.matcher ? uiState.matcher.tagLabel(tag) : tag;
}

export function uiRatingBase(rating) {
  // "moderate-to-strong" is rated at its lower end for display: moderate.
  const r = String(rating || '').toLowerCase().trim();
  return r.split(/-to-|\s*\/\s*/)[0] || '';
}
export function uiRatingBadge(rating) {
  const r = String(rating || '').toLowerCase().trim();
  const base = uiRatingBase(r);
  const cls = base === 'strong' ? 'green' : base === 'moderate' ? 'blue' : base === 'limited' ? 'amber' : 'gray';
  return `<span class="badge ${cls}">${uiEsc((r || 'unrated').replace(/-to-/g, ' to '))} evidence</span>`;
}

export function uiVerdictWord(v) {
  return v === 'fail' ? 'FAIL' : v === 'caution' ? 'CAUTION' : 'PASS';
}

export function uiSourcesHTML(sourceIds, ruleVerify = false) {
  const ids = sourceIds || [];
  if (!ids.length) return '<p class="small muted">No source listed.</p>';
  const items = ids.map(id => {
    const s = uiState.sourcesById.get(id);
    const verify = ruleVerify || (s && s.verify);
    const cite = s ? s.citation : `${id} (citation not found in sources.json)`;
    return `<li>${uiEsc(cite)}${s && s.type ? ` <span class="muted">[${uiEsc(s.type)}${s.year ? ', ' + s.year : ''}]</span>` : ''}${verify ? ' <span class="badge amber">verify</span>' : ''}${s && s.verify_note ? `<div class="small muted">${uiEsc(s.verify_note)}</div>` : ''}</li>`;
  }).join('');
  return `<ul class="sources">${items}</ul>`;
}

export function uiSourcesDisclosure(sourceIds, ruleVerify = false) {
  const n = (sourceIds || []).length;
  return `<details><summary>Sources (${n})${ruleVerify ? ' <span class="badge amber" style="margin-left:.4rem">verify</span>' : ''}</summary>${uiSourcesHTML(sourceIds, ruleVerify)}</details>`;
}

// One rule as produced by plan.js (ruleRef shape): text, strength, tier, module, sources, verify.
export function uiRuleHTML(rule, opts = {}) {
  if (!rule) return '';
  const meta = [];
  if (rule.moduleName && !opts.hideModule) meta.push(`<span class="badge gray outline">${uiEsc(rule.moduleName)}</span>`);
  if (rule.strength) meta.push(`<span class="badge ${rule.strength === 'must' ? 'red' : rule.strength === 'should' ? 'blue' : 'gray'} outline">${uiEsc(rule.strength)}</span>`);
  meta.push(`<span class="badge gray outline">tier ${uiEsc(rule.tier || 1)}</span>`);
  if (rule.clinician) meta.push('<span class="badge blue">clinician-set</span>');
  if (rule.userAllergen) meta.push('<span class="badge red">allergen</span>');
  if (rule.preference) meta.push('<span class="badge gray">preference</span>');
  if (rule.tier2Pending) meta.push('<span class="badge amber">waiting for clinician number</span>');
  if (rule.needsWeight) meta.push('<span class="badge amber">needs weight</span>');
  if (rule.note) meta.push(`<span class="muted">${uiEsc(rule.note)}</span>`);
  const verify = !!rule.verify;
  return `<div class="rule">
    <div class="rule-text">${uiEsc(rule.text || rule.rule)}</div>
    <div class="rule-meta">${meta.join(' ')}</div>
    ${(rule.sources && rule.sources.length) || verify ? uiSourcesDisclosure(rule.sources, verify) : ''}
  </div>`;
}

export function uiRulesList(rules, opts = {}) {
  if (!rules || !rules.length) return '<p class="muted small">None.</p>';
  return rules.map(r => uiRuleHTML(r, opts)).join('');
}

export function uiNutrientLabel(n) { return labelNutrient(n); }

export function uiNoticeHTML(n, opts = {}) {
  const level = n.level || 'info';
  const head = level === 'block' ? 'Stop' : level === 'warn' ? 'Caution' : 'Info';
  const ack = n.ackKey && opts.person && !(opts.person.acknowledged || []).includes(n.ackKey)
    ? `<button class="btn small" type="button" data-ack="${uiEsc(n.ackKey)}">I understand</button>` : '';
  return `<div class="notice ${level}" role="${level === 'block' ? 'alert' : 'status'}"><div class="notice-head">${head}</div><div>${uiEsc(n.text)}</div>${ack}</div>`;
}

export function uiToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(uiToast._t);
  uiToast._t = setTimeout(() => t.classList.remove('show'), 2400);
}

export function uiModal(html, opts = {}) {
  const root = document.getElementById('modal-root');
  if (!root) return null;
  root.innerHTML = `<div class="modal-backdrop" data-close="1"><div class="modal" role="dialog" aria-modal="true" aria-label="${uiEsc(opts.label || 'Dialog')}"><div class="modal-head"><h2>${uiEsc(opts.title || '')}</h2><button class="btn small" type="button" data-close="1" aria-label="Close">Close</button></div><div class="modal-body">${html}</div></div></div>`;
  const backdrop = root.firstElementChild;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); if (opts.onClose) opts.onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('click', e => { if (e.target.dataset.close) close(); });
  document.addEventListener('keydown', onKey);
  const first = backdrop.querySelector('.modal-body button, .modal-body input, .modal-body [tabindex]') || backdrop.querySelector('button');
  if (first) first.focus();
  return { close, el: backdrop.querySelector('.modal-body') };
}

export function uiCloseModal() {
  const root = document.getElementById('modal-root');
  if (root) root.innerHTML = '';
}

export function uiNavigate(hash) {
  if (location.hash === hash) uiState.rerender();
  else location.hash = hash;
}

export function uiModuleName(id) {
  const m = uiState.conditionsById.get(id);
  return m ? m.name : id;
}

export function uiWeekKey(person) {
  return `${person.id}|${uiIsoDate(uiToday())}|${person.planSeed || 0}`;
}

export function uiSegmented(name, options, current, opts = {}) {
  // options: [{value,label}] ; renders radio pills
  return `<div class="seg" role="radiogroup" aria-label="${uiEsc(opts.label || name)}">${options.map(o => `<label class="${String(o.value) === String(current) ? 'on' : ''}"><input type="radio" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${String(o.value) === String(current) ? 'checked' : ''} data-seg="${uiEsc(name)}">${uiEsc(o.label)}</label>`).join('')}</div>`;
}

export function uiMultiPills(name, options, currentArr, opts = {}) {
  const cur = new Set(currentArr || []);
  return `<div class="seg" role="group" aria-label="${uiEsc(opts.label || name)}">${options.map(o => `<label class="${cur.has(o.value) ? 'on' : ''}"><input type="checkbox" name="${uiEsc(name)}" value="${uiEsc(o.value)}" ${cur.has(o.value) ? 'checked' : ''} data-multi="${uiEsc(name)}">${uiEsc(o.label)}</label>`).join('')}</div>`;
}

export function uiYesNo(name, value) {
  return uiSegmented(name, [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }], value === true ? 'yes' : value === false ? 'no' : '');
}

export function uiDownload(filename, text, type = 'application/json') {
  try {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch { return false; }
}

export async function uiCopyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function uiPctClass(pct, kind) {
  if (kind === 'limit') return pct > 100 ? 'over' : 'ok';
  return pct < 100 ? 'under' : 'ok';
}

export function uiFindPersonById(id) {
  return (uiState.profile.people || []).find(p => p.id === id) || null;
}

export function uiMinutesBucket(min) {
  const m = Number(min) || 0;
  if (m < 10) return 8;
  if (m < 20) return 15;
  if (m < 40) return 30;
  return 50;
}
