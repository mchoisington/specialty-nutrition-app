// Learn: one article page per module (data/articles.json, falling back to the module's education block), plus "How this app decides".
import { uiState, uiEsc, uiRatingBadge, uiRatingBase, uiSourcesHTML, uiRuleHTML, uiArticleFor } from './common.js';

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
      root.innerHTML = `<a class="btn small" href="#/learn">All topics</a><h1 style="margin-top:.75rem">${uiEsc(m.name)}</h1>${learnArticleHTML(m, { full: true })}`;
      return;
    }
  }
  const groups = [['condition', 'Medical conditions'], ['pattern', 'Eating patterns'], ['restriction', 'Restrictions and safeguards']];
  const mods = uiState.data.conditions;
  root.innerHTML = `
    <h1>Learn</h1>
    <div class="card"><h2 style="margin-top:0">How this app decides</h2><p>Two tiers, hard conflicts, allergens as absolute, unknown is not safe, no language model in the safety path. Read this first.</p><a class="btn" href="#/learn/how">Read</a></div>
    ${groups.map(([key, title]) => {
      const list = mods.filter(m => m.category === key);
      if (!list.length) return '';
      return `<h2>${title}</h2>${list.map(m => `<a class="card tight" href="#/learn/${uiEsc(m.id)}" style="display:block;text-decoration:none;color:inherit"><div class="row"><strong>${uiEsc(m.name)}</strong> ${uiRatingBadge(m.evidence && m.evidence.rating)}${uiArticleFor(m.id) ? '<span class="badge gray outline">article</span>' : ''}</div><div class="small muted">${uiEsc(m.evidence && m.evidence.summary || '')}</div></a>`).join('')}`;
    }).join('')}
    ${mods.length ? '' : '<p class="empty">No modules are loaded (data/conditions.json is missing or empty).</p>'}
  `;
}

function learnRatingHTML(m) {
  const rating = (m.evidence && m.evidence.rating) || '';
  return `<div class="row article-rating">${uiRatingBadge(rating)} <span class="badge gray outline">${uiEsc(m.category)}</span>${m.phase1_ref ? `<span class="small muted">Phase 1: ${uiEsc(m.phase1_ref)}</span>` : ''}</div>
    <p class="small muted">${uiEsc(LEARN_RATING_SENTENCE[uiRatingBase(rating)] || '')}${/-to-/.test(String(rating)) ? ` <span>Rated ${uiEsc(String(rating).replace(/-to-/g, ' to '))}: the evidence sits between those two levels.</span>` : ''}</p>`;
}

function learnSafeUrl(u) {
  const s = String(u || '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// The article page for a module. With an article in data/articles.json: main points, rating, sections, links, references.
// Without one: main points from education.plain, then the education lists. opts.full adds the module's rules, Tier 2 numbers, and phases.
export function learnArticleHTML(m, opts = {}) {
  const art = uiArticleFor(m.id);
  const ed = m.education || {};
  const list = (arr) => Array.isArray(arr) && arr.length ? `<ul>${arr.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul>` : '<p class="muted small">Nothing recorded.</p>';
  const mainPoints = art && Array.isArray(art.summary) && art.summary.length ? art.summary : [ed.plain].filter(Boolean);
  const sections = art && Array.isArray(art.sections) ? art.sections.filter(s => s && (s.heading || (Array.isArray(s.paragraphs) && s.paragraphs.length))) : [];
  const links = art && Array.isArray(art.links) ? art.links.filter(l => l && l.label) : [];
  const refs = art && Array.isArray(art.references) ? art.references.filter(r => r && (r.citation || r.url)) : [];
  return `<article class="article">
    <h2 class="article-h">Main points</h2>
    ${mainPoints.length ? `<ul class="main-points">${mainPoints.map(x => `<li>${uiEsc(x)}</li>`).join('')}</ul>` : '<p class="muted">No plain-language summary recorded for this module yet.</p>'}
    ${learnRatingHTML(m)}
    ${m.evidence && m.evidence.summary && !art ? `<p><strong>${uiEsc(m.evidence.summary)}</strong></p>` : ''}
    ${sections.length ? sections.map(s => `${s.heading ? `<h2 class="article-h">${uiEsc(s.heading)}</h2>` : ''}${(Array.isArray(s.paragraphs) ? s.paragraphs : []).map(p => `<p>${uiEsc(p)}</p>`).join('')}`).join('') : `
      <h3>What the evidence shows</h3>${list(ed.evidence)}
      <h3>Contested or nuanced</h3>${list(ed.contested)}
      <h3>What this app will not claim</h3>${list(ed.do_not_claim)}
      ${ed.app_language ? `<h3>How the app words it</h3>${Array.isArray(ed.app_language) ? list(ed.app_language) : `<p>${uiEsc(ed.app_language)}</p>`}` : ''}`}
    ${links.length ? `<h2 class="article-h">Helpful links</h2><ul class="links">${links.map(l => { const u = learnSafeUrl(l.url); return `<li>${u ? `<a href="${uiEsc(u)}" target="_blank" rel="noopener noreferrer">${uiEsc(l.label)}</a>` : uiEsc(l.label)}${l.kind ? ` <span class="badge gray outline">${uiEsc(l.kind)}</span>` : ''}</li>`; }).join('')}</ul>` : ''}
    ${refs.length ? `<h2 class="article-h">References</h2><ol class="references">${refs.map(r => { const u = learnSafeUrl(r.url); return `<li id="ref-${uiEsc(r.id || '')}">${uiEsc(r.citation || '')}${u ? ` <a href="${uiEsc(u)}" target="_blank" rel="noopener noreferrer" class="ref-url">${uiEsc(u)}</a>` : ''}${r.verify ? ' <span class="badge amber">verify</span>' : ''}</li>`; }).join('')}</ol>` : ''}
    ${opts.full ? `<details><summary>Rules in this module (${(m.rules || []).length})</summary>${(m.rules || []).map(r => uiRuleHTML({ ...r, moduleName: m.name }, { hideModule: true })).join('') || '<p class="muted small">No rules.</p>'}</details>` : ''}
    ${opts.full && Array.isArray(m.tier2) && m.tier2.length ? `<h3>Clinician-set numbers (Tier 2)</h3><ul>${m.tier2.map(t => `<li><strong>${uiEsc(t.label)}</strong>${t.consensus ? `: published range ${uiEsc(t.consensus)}` : ''}${t.why ? `. ${uiEsc(t.why)}` : ''}</li>`).join('')}</ul>` : ''}
    ${opts.full && Array.isArray(m.phases) && m.phases.length ? `<h3>Phases</h3><ul>${m.phases.map(p => `<li><strong>${uiEsc(p.label || p.id)}</strong>${p.min_weeks || p.max_weeks ? `: ${p.min_weeks || 0} to ${p.max_weeks || 'open'} weeks` : ''}</li>`).join('')}</ul>` : ''}
    ${refs.length ? `<details><summary>Sources the rules cite (${(m.sources || []).length})</summary>${uiSourcesHTML(m.sources)}</details>` : `<h3>Sources</h3>${uiSourcesHTML(m.sources)}`}
  </article>`;
}

// Kept for older callers: the education block without the article layer.
export function learnModuleHTML(m, opts = {}) {
  return learnArticleHTML(m, opts);
}

function learnRenderHow(root) {
  root.innerHTML = `
    <a class="btn small" href="#/learn">All topics</a>
    <h1 style="margin-top:.75rem">How this app decides</h1>
    <div class="card">
      <h3>Two tiers of rules</h3>
      <p>Tier 1 rules come straight from published guidelines and apply to everyone with the condition: sodium under 2,300 mg a day for high blood pressure, for example. Tier 2 rules need a number that only your clinician can set: a protein target in kidney disease, a fluid limit in advanced heart failure. The app knows the published range for a Tier 2 rule, shows it, and refuses to pick a value. Until you enter your clinician's number, that module runs on its Tier 1 rules only and the plan says so.</p>
      <h3>Hard conflicts stop the number, not the plan</h3>
      <p>Some conditions give opposite advice. DASH is potassium-rich; kidney disease limits potassium. When two of your modules disagree like that, the app generates no number for that nutrient, shows the conflict, and asks for a clinician number. Everything else in the plan still builds.</p>
      <h3>Allergens are absolute</h3>
      <p>A confirmed food allergy is a hard exclusion. No preference, mode, phase, or acknowledgment overrides it. A recipe with a matching ingredient is never scheduled, and a checked food fails.</p>
      <h3>Unknown is not safe</h3>
      <p>The ingredient checker matches exact terms from a maintained dictionary. It does not guess. Anything it does not recognize is reported as "not recognized" and, when you have an allergen on file, that alone makes the verdict a caution. Terms like "natural flavors" or "spices" that can hide an allergen are flagged separately.</p>
      <h3>No language model in the safety path</h3>
      <p>Nothing that decides whether a food passes, what a number is, or what a rule says uses a language model. Safety decisions come from data files a person can read: the rules, the dictionary, the food table. Numbers are summed from grams; they never come from text. The one optional helper, on the Preferences step, can draft a description of a diet you name; it is labeled as general knowledge, it never saves anything by itself, and the rules it proposes are soft preferences you confirm.</p>
      <h3>Diets you define yourself</h3>
      <p>A diet that is not on the list can be added by name. It becomes a module marked "Defined by you" with soft rules and no evidence rating. It never loosens an allergen or a condition rule.</p>
      <h3>Nutrient data</h3>
      <p>Every food is a USDA FoodData Central record (SR Legacy or Foundation Foods), keyed by its FDC ID. The import script writes the food table; nobody edits numbers by hand. Where USDA has no value for a nutrient (added sugar, for example), the app shows "no data" rather than an estimate.</p>
      <h3>FODMAP tags are not Monash-verified</h3>
      <p>The low FODMAP module is built from published studies and USDA data. It does not use the Monash University database, and its tags carry a "not Monash-verified" notice. Portion notes matter: many foods are low FODMAP in a small serving and high in a large one.</p>
      <h3>Time-limited protocols</h3>
      <p>Elimination phases (low FODMAP, low histamine) have a minimum and maximum length from the protocol. Past the maximum the app prompts reintroduction and requires an acknowledgment to continue.</p>
      <h3>Stacked restrictions</h3>
      <p>Running several diets that each cut out whole food groups at the same time makes it harder to get enough fiber, calcium, protein, and variety. When three or more are active at once the plan says so and suggests running one at a time where you can.</p>
      <h3>Where this comes from</h3>
      <p>The evidence review behind every module is <strong>docs/PHASE-1-evidence-and-regulatory-foundation.md</strong> (Phase 1: Evidence and Regulatory Foundation), and the build decisions are in <strong>docs/PHASE-2-prd-and-architecture.md</strong>. Items marked VERIFY in Phase 1 are shown with that flag in the app until they are cleared in docs/VERIFY-log.md.</p>
      <p class="small muted">This app is for general wellness and education. It does not diagnose or treat any condition. Your clinician sets any therapeutic numbers.</p>
    </div>`;
}
