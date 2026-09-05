// Learn: education per module, straight from conditions.json, plus "How this app decides".
import { uiState, uiEsc, uiRatingBadge, uiRatingBase, uiSourcesHTML, uiRuleHTML } from './common.js';

const LEARN_RATING_SENTENCE = {
  strong: 'Strong: multiple randomized trials or a major society guideline with Class 1 / Level A backing.',
  moderate: 'Moderate: consistent trials or guideline recommendations with conditional strength.',
  limited: 'Limited: small trials, observational data, or expert consensus with little trial support.',
  insufficient: 'Insufficient: no condition-specific dietary evidence; only general healthy-eating patterns apply.'
};

export function renderLearnScreen(root, ctx) {
  const id = ctx.route.parts[0];
  if (id === 'how') return learnRenderHow(root);
  if (id) {
    const m = uiState.conditionsById.get(id);
    if (m) {
      root.innerHTML = `<a class="btn small" href="#/learn">All topics</a><h1 style="margin-top:.75rem">${uiEsc(m.name)}</h1>${learnModuleHTML(m, { full: true })}`;
      return;
    }
  }
  const groups = [['condition', 'Medical conditions'], ['pattern', 'Eating patterns'], ['restriction', 'Restrictions and safeguards']];
  const mods = uiState.data.conditions;
  root.innerHTML = `
    <h1>Learn</h1>
    <div class="card"><h2 style="margin-top:0">How this app decides</h2><p>Two tiers, hard conflicts, allergens as absolute, unknown is not safe, no language model. Read this first.</p><a class="btn" href="#/learn/how">Read</a></div>
    ${groups.map(([key, title]) => {
      const list = mods.filter(m => m.category === key);
      if (!list.length) return '';
      return `<h2>${title}</h2>${list.map(m => `<a class="card tight" href="#/learn/${uiEsc(m.id)}" style="display:block;text-decoration:none;color:inherit"><div class="row"><strong>${uiEsc(m.name)}</strong> ${uiRatingBadge(m.evidence && m.evidence.rating)}</div><div class="small muted">${uiEsc(m.evidence && m.evidence.summary || '')}</div></a>`).join('')}`;
    }).join('')}
    ${mods.length ? '' : '<p class="empty">No modules are loaded (data/conditions.json is missing or empty).</p>'}
  `;
}

export function learnModuleHTML(m, opts = {}) {
  const ed = m.education || {};
  const rating = (m.evidence && m.evidence.rating) || '';
  const list = (arr) => Array.isArray(arr) && arr.length ? `<ul>${arr.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing recorded.</p>';
  return `
    <div class="row" style="margin-bottom:.5rem">${uiRatingBadge(rating)} <span class="badge gray outline">${uiEsc(m.category)}</span>${m.phase1_ref ? `<span class="small muted">Phase 1: ${uiEsc(m.phase1_ref)}</span>` : ''}</div>
    <p class="small muted">${uiEsc(LEARN_RATING_SENTENCE[uiRatingBase(rating)] || '')}${/-to-/.test(String(rating)) ? ` <span>Rated ${uiEsc(String(rating).replace(/-to-/g, ' to '))}: the evidence sits between those two levels.</span>` : ''}</p>
    ${m.evidence && m.evidence.summary ? `<p><strong>${uiEsc(m.evidence.summary)}</strong></p>` : ''}
    ${ed.plain ? `<p>${uiEsc(ed.plain)}</p>` : '<p class="muted">No plain-language summary recorded for this module yet.</p>'}
    <h3>What the evidence shows</h3>${list(ed.evidence)}
    <h3>Contested or nuanced</h3>${list(ed.contested)}
    <h3>What this app will not claim</h3>${list(ed.do_not_claim)}
    ${ed.app_language ? `<h3>How the app words it</h3>${Array.isArray(ed.app_language) ? list(ed.app_language) : `<p>${uiEsc(ed.app_language)}</p>`}` : ''}
    ${opts.full ? `<h3>Rules in this module (${(m.rules || []).length})</h3>${(m.rules || []).map(r => uiRuleHTML({ ...r, moduleName: m.name }, { hideModule: true })).join('') || '<p class="muted small">No rules.</p>'}` : ''}
    ${opts.full && Array.isArray(m.tier2) && m.tier2.length ? `<h3>Clinician-set numbers (Tier 2)</h3><ul>${m.tier2.map(t => `<li><strong>${uiEsc(t.label)}</strong>${t.consensus ? `: published range ${uiEsc(t.consensus)}` : ''}${t.why ? `. ${uiEsc(t.why)}` : ''}</li>`).join('')}</ul>` : ''}
    ${opts.full && Array.isArray(m.phases) && m.phases.length ? `<h3>Phases</h3><ul>${m.phases.map(p => `<li><strong>${uiEsc(p.label || p.id)}</strong>${p.min_weeks || p.max_weeks ? `: ${p.min_weeks || 0} to ${p.max_weeks || 'open'} weeks` : ''}</li>`).join('')}</ul>` : ''}
    <h3>Sources</h3>${uiSourcesHTML(m.sources)}
  `;
}

function learnRenderHow(root) {
  root.innerHTML = `
    <a class="btn small" href="#/learn">All topics</a>
    <h1 style="margin-top:.75rem">How this app decides</h1>
    <div class="card">
      <h3>Two tiers of rules</h3>
      <p>Tier 1 rules come straight from published guidelines and apply to everyone with the condition: sodium under 2,300 mg a day for high blood pressure, for example. Tier 2 rules need a number that only your clinician can set: a protein target in kidney disease, a sodium target in POTS. The app knows the published range for a Tier 2 rule, shows it, and refuses to pick a value. Until you enter your clinician's number, that module runs on its Tier 1 rules only and the plan says so.</p>
      <h3>Hard conflicts stop the number, not the plan</h3>
      <p>Some conditions give opposite advice. High blood pressure wants less sodium; POTS wants much more. When two of your modules disagree like that, the app generates no number for that nutrient, shows the conflict, and asks for a clinician number. Everything else in the plan still builds.</p>
      <h3>Allergens are absolute</h3>
      <p>A confirmed food allergy is a hard exclusion. No preference, mode, phase, or acknowledgment overrides it. A recipe with a matching ingredient is never scheduled, and a checked food fails.</p>
      <h3>Unknown is not safe</h3>
      <p>The ingredient checker matches exact terms from a maintained dictionary. It does not guess. Anything it does not recognize is reported as "not recognized" and, when you have an allergen on file, that alone makes the verdict a caution. Terms like "natural flavors" or "spices" that can hide an allergen are flagged separately.</p>
      <h3>No language model</h3>
      <p>Nothing in this app uses a language model or any other form of inference. Safety decisions come from data files a person can read: the rules, the dictionary, the food table. Numbers are summed from grams; they never come from text.</p>
      <h3>Nutrient data</h3>
      <p>Every food is a USDA FoodData Central record (SR Legacy or Foundation Foods), keyed by its FDC ID. The import script writes the food table; nobody edits numbers by hand. Where USDA has no value for a nutrient (added sugar, for example), the app shows "no data" rather than an estimate.</p>
      <h3>FODMAP tags are not Monash-verified</h3>
      <p>The low FODMAP module is built from published studies and USDA data. It does not use the Monash University database, and its tags carry a "not Monash-verified" notice. Portion notes matter: many foods are low FODMAP in a small serving and high in a large one.</p>
      <h3>Time-limited protocols</h3>
      <p>Elimination phases (low FODMAP, low histamine) have a minimum and maximum length from the protocol. Past the maximum the app prompts reintroduction and requires an acknowledgment to continue. Running three or more elimination-style restrictions at once triggers a restriction-load check-in.</p>
      <h3>Screening first</h3>
      <p>Five screening questions come before any weight-focused or restrictive feature. A positive screen turns off calorie targets, weight-loss plans, and new elimination protocols, keeps allergen and celiac rules on, and shows support resources.</p>
      <h3>Where this comes from</h3>
      <p>The evidence review behind every module is <strong>docs/PHASE-1-evidence-and-regulatory-foundation.md</strong> (Phase 1: Evidence and Regulatory Foundation), and the build decisions are in <strong>docs/PHASE-2-prd-and-architecture.md</strong>. Items marked VERIFY in Phase 1 are shown with that flag in the app until they are cleared in docs/VERIFY-log.md.</p>
      <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</p>
    </div>`;
}
