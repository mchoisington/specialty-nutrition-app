// Merges the modules a person selected into one plan.
// Every applied rule carries its source ids. Conflicts are surfaced, never silently resolved.

export const FEATURE_MODULES = {
  // feature id -> module ids that the feature gates
  'weight-loss': ['weight-management-glp1'],
  'ketogenic': ['low-carb-ketogenic'],
  'low-carb-under-175g': ['low-carb-ketogenic'],
  'intermittent-fasting': [],
  'elimination-protocols-except-allergen-celiac': ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac'],
  'new-elimination-protocols': ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac'],
  'calorie-targets': []
};

export const ELIMINATION_MODULES = ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac', 'low-carb-ketogenic'];

const DAY_MS = 86400000;

function daysBetween(a, b) {
  return Math.floor((b - a) / DAY_MS);
}

export function tier2ParamFor(rule) {
  if (rule.param) return rule.param;
  if (!rule.nutrient) return null;
  const op = rule.op || (rule.kind === 'limit' ? '<=' : '>=');
  return rule.nutrient + (op.startsWith('<') ? '_max' : '_min');
}

function ruleRef(module, rule, extra = {}) {
  return {
    module: module.id,
    moduleName: module.name,
    rule: rule.id,
    kind: rule.kind,
    text: rule.text,
    strength: rule.strength || 'should',
    tier: rule.tier || 1,
    sources: rule.sources || [],
    verify: !!rule.verify,
    ...extra
  };
}

export function buildPlan({ person, conditions, dictionaries, today = new Date() }) {
  const byId = new Map(conditions.map(m => [m.id, m]));
  const notices = [];
  const selected = new Set(person.modules || []);

  // Auto-include modules driven by profile flags
  if ((person.pregnancy || person.breastfeeding) && byId.has('pregnancy-gdm-breastfeeding')) selected.add('pregnancy-gdm-breastfeeding');
  if ((person.allergens || []).length && byId.has('food-allergies')) selected.add('food-allergies');
  const screenPositive = !!(person.screen && person.screen.positive);
  if (screenPositive && byId.has('eating-disorder-screen')) selected.add('eating-disorder-screen');
  if (person.adult === false) notices.push({ level: 'block', code: 'adults-only', text: 'This app is for adults. A caregiver may manage a child\'s confirmed celiac disease or diagnosed food allergies only.' });

  // Disabled features
  const disabled = new Map(); // feature -> by module
  for (const id of selected) {
    const m = byId.get(id);
    if (!m) continue;
    if (id === 'eating-disorder-screen' && !screenPositive) continue;
    for (const f of m.disables || []) if (!disabled.has(f)) disabled.set(f, id);
  }
  if (person.adult === false) {
    for (const f of ['weight-loss', 'ketogenic', 'low-carb-under-175g', 'intermittent-fasting', 'calorie-targets', 'new-elimination-protocols', 'elimination-protocols-except-allergen-celiac']) if (!disabled.has(f)) disabled.set(f, 'pediatric');
  }
  const isDisabled = f => disabled.has(f);
  const disabledModules = new Map();
  for (const [f, by] of disabled) for (const mid of FEATURE_MODULES[f] || []) if (selected.has(mid)) disabledModules.set(mid, { feature: f, by });
  for (const [mid, info] of disabledModules) {
    const m = byId.get(mid);
    notices.push({ level: 'block', code: 'module-disabled', module: mid, text: `${m ? m.name : mid} is turned off because ${labelFor(byId, info.by)} disables ${info.feature.replace(/-/g, ' ')}.` });
  }

  const active = [...selected].filter(id => byId.has(id) && !disabledModules.has(id)).map(id => byId.get(id));
  const activeIds = new Set(active.map(m => m.id));

  // Medication-driven suppressions
  const suppressedRules = new Map(); // ruleId -> reason
  for (const m of active) {
    for (const q of m.medication_questions || []) {
      const answered = person.medications && person.medications[q.id];
      if (!answered) continue;
      for (const eff of [].concat(q.effect || [])) {
        const mm = /^suppress:(.+)$/.exec(eff);
        if (mm) suppressedRules.set(mm[1], { reason: 'medication', text: q.text, module: m.id });
      }
    }
  }

  // Conflicts between active modules
  const conflicts = [];
  const seenPair = new Set();
  const blockedParams = new Map(); // param base (e.g. sodium_mg) -> conflict
  const suppressedModuleParams = []; // {module, param}
  const winnerPairs = []; // {winner, loser}
  for (const m of active) {
    for (const c of m.conflicts || []) {
      if (!activeIds.has(c.with)) continue;
      const key = [m.id, c.with].sort().join('|') + '|' + (c.param || '') + '|' + (c.type || '');
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      const entry = { a: m.id, b: c.with, aName: m.name, bName: labelFor(byId, c.with), type: c.type, param: c.param || null, resolution: c.resolution || 'none', text: c.text || '', status: 'info' };
      const res = String(c.resolution || 'none');
      if (c.type === 'hard' && res === 'clinician') {
        entry.status = 'blocked';
        if (c.param) blockedParams.set(c.param, entry);
      } else if (res.startsWith('suppress:')) {
        const target = res.slice('suppress:'.length);
        entry.status = 'suppressed';
        if (c.param) suppressedModuleParams.push({ module: target, param: c.param, by: target === m.id ? c.with : m.id });
        else suppressedModuleParams.push({ module: target, param: null, by: target === m.id ? c.with : m.id });
      } else if (res.startsWith('winner:')) {
        const winner = res.slice('winner:'.length);
        entry.status = 'winner';
        winnerPairs.push({ winner, loser: winner === m.id ? c.with : m.id });
      } else if (res === 'time-limit') {
        entry.status = 'time-limited';
      } else if (res === 'acknowledge') {
        const ackKey = [m.id, c.with].sort().join('|');
        entry.status = (person.acknowledged || []).includes(ackKey) ? 'acknowledged' : 'needs-ack';
        entry.ackKey = ackKey;
      } else if (res === 'pairing') {
        entry.status = 'pairing';
      } else if (c.type === 'compatible' || res === 'none') {
        entry.status = 'compatible';
      } else if (c.type === 'subsumed') {
        entry.status = 'subsumed';
      }
      conflicts.push(entry);
    }
  }

  // Phases (elimination protocols) and modes (IBD flare)
  const phases = [];
  const activePhaseRules = new Map(); // module -> Set(ruleIds allowed) or null for all
  for (const m of active) {
    if (!Array.isArray(m.phases) || !m.phases.length) continue;
    const state = (person.phases || {})[m.id] || null;
    const phase = state && m.phases.find(p => p.id === state.phase) ? m.phases.find(p => p.id === state.phase) : m.phases[0];
    const started = state && state.started ? new Date(state.started) : today;
    const weeks = Math.max(0, daysBetween(started, today) / 7);
    let status = 'active';
    if (phase.max_weeks && weeks > phase.max_weeks) status = 'expired';
    else if (phase.min_weeks && weeks >= phase.min_weeks) status = 'ready-to-advance';
    const nextPhase = m.phases[m.phases.indexOf(phase) + 1] || null;
    phases.push({ module: m.id, moduleName: m.name, phase: phase.id, label: phase.label || phase.id, started: started.toISOString().slice(0, 10), weeks: Math.round(weeks * 10) / 10, min_weeks: phase.min_weeks || null, max_weeks: phase.max_weeks || null, status, next: nextPhase ? nextPhase.id : null, nextLabel: nextPhase ? (nextPhase.label || nextPhase.id) : null });
    if (!state) notices.push({ level: 'info', code: 'phase-started', module: m.id, text: `${m.name}: starting the ${phase.label || phase.id} phase today. Phase lengths are set by the protocol and the app will prompt you when it is time to move on.` });
    if (status === 'expired') {
      const ackKey = `phase-expired|${m.id}|${phase.id}`;
      const acked = (person.acknowledged || []).includes(ackKey);
      notices.push({ level: acked ? 'warn' : 'block', code: 'phase-expired', module: m.id, ackKey, text: `${m.name}: the ${phase.label || phase.id} phase has passed its maximum of ${phase.max_weeks} weeks. ${nextPhase ? 'Move to ' + (nextPhase.label || nextPhase.id) + '.' : ''} Staying restricted longer than the protocol is not recommended.` });
    } else if (status === 'ready-to-advance' && nextPhase) {
      notices.push({ level: 'info', code: 'phase-ready', module: m.id, text: `${m.name}: you have completed the minimum ${phase.min_weeks} weeks of ${phase.label || phase.id}. You can move to ${nextPhase.label || nextPhase.id} when ready.` });
    }
    const phaseRuleIds = new Set();
    for (const p of m.phases) for (const r of p.rules || []) phaseRuleIds.add(r);
    activePhaseRules.set(m.id, { allowed: new Set(phase.rules || []), phaseRuleIds });
  }
  const activeModeRules = new Map();
  for (const m of active) {
    if (!Array.isArray(m.modes) || !m.modes.length) continue;
    const def = m.modes.find(x => x.default) || m.modes[0];
    let stored = (person.modes || {})[m.id];
    let modeId = typeof stored === 'string' ? stored : stored && stored.mode;
    const since = stored && typeof stored === 'object' && stored.since ? new Date(stored.since) : null;
    let mode = m.modes.find(x => x.id === modeId) || def;
    if (mode.expires_days && since && daysBetween(since, today) > mode.expires_days) {
      notices.push({ level: 'warn', code: 'mode-expired', module: m.id, text: `${m.name}: ${mode.label || mode.id} mode has run ${mode.expires_days} days. Check in: are you still in a ${mode.label || mode.id}? The app has returned to ${def.label || def.id} rules until you confirm.` });
      mode = def;
    } else if (mode.expires_days && since) {
      notices.push({ level: 'info', code: 'mode-active', module: m.id, text: `${m.name}: ${mode.label || mode.id} mode, day ${daysBetween(since, today) + 1} of ${mode.expires_days}.` });
    }
    const modeRuleIds = new Set();
    for (const x of m.modes) for (const r of x.rules || []) modeRuleIds.add(r);
    activeModeRules.set(m.id, { allowed: new Set(mode.rules || []), modeRuleIds, mode: mode.id });
  }

  // Tier 2
  const tier2Missing = [];
  const tier2Applied = [];
  const tier2Values = person.tier2 || {};

  // Collect rules
  const limits = {};   // nutrient -> {value, ideal, per, per_kg, rules:[]}
  const targets = {};  // nutrient -> {min, max, per, rules:[]}
  const avoid = {};    // tag -> {hard, rules:[]}
  const prefer = {};   // tag -> {rules:[]}
  const timing = [], behavior = [], info = [];
  const suppressed = [];
  const applied = [];

  const weight = Number(person.weight_kg) || null;

  for (const m of active) {
    const phaseInfo = activePhaseRules.get(m.id);
    const modeInfo = activeModeRules.get(m.id);
    for (const rule of m.rules || []) {
      // phase gating
      if (phaseInfo && phaseInfo.phaseRuleIds.has(rule.id) && !phaseInfo.allowed.has(rule.id)) continue;
      if (modeInfo && modeInfo.modeRuleIds.has(rule.id) && !modeInfo.allowed.has(rule.id)) continue;
      // medication suppression
      if (suppressedRules.has(rule.id)) { suppressed.push(ruleRef(m, rule, { reason: suppressedRules.get(rule.id) })); continue; }
      // conflict suppression on module+param
      const nut = rule.nutrient || null;
      const sup = suppressedModuleParams.find(s => s.module === m.id && (s.param === null || s.param === nut || (nut && s.param && nut.startsWith(s.param))));
      if (sup && (rule.kind === 'limit' || rule.kind === 'target')) { suppressed.push(ruleRef(m, rule, { reason: { reason: 'conflict', by: sup.by } })); continue; }
      // blocked params (hard conflict, clinician)
      if (nut && (rule.kind === 'limit' || rule.kind === 'target')) {
        const blocked = [...blockedParams.entries()].find(([p]) => nut === p || nut.startsWith(p));
        if (blocked) {
          const param = tier2ParamFor(rule);
          if (typeof tier2Values[param] === 'number') {
            // clinician number resolves the conflict
            applyNumber(rule, m, tier2Values[param], { clinician: true, conflict: blocked[1] });
            tier2Applied.push({ module: m.id, param, value: tier2Values[param] });
          } else {
            suppressed.push(ruleRef(m, rule, { reason: { reason: 'hard-conflict', with: blocked[1].a === m.id ? blocked[1].b : blocked[1].a } }));
            if (!tier2Missing.some(t => t.param === param)) tier2Missing.push({ module: m.id, moduleName: m.name, param, label: `${labelNutrient(nut)} (${blocked[1].aName} and ${blocked[1].bName} conflict)`, consensus: 'Your clinician must set this number.', why: blocked[1].text, conflict: true });
          }
          continue;
        }
      }
      // tier 2 gating
      if ((rule.tier || 1) === 2) {
        const param = tier2ParamFor(rule);
        if (param && typeof tier2Values[param] === 'number') {
          applyNumber(rule, m, tier2Values[param], { clinician: true });
          tier2Applied.push({ module: m.id, param, value: tier2Values[param] });
        } else {
          const decl = (m.tier2 || []).find(t => t.param === param) || {};
          if (!tier2Missing.some(t => t.param === param && t.module === m.id)) tier2Missing.push({ module: m.id, moduleName: m.name, param, label: decl.label || rule.text, consensus: decl.consensus || '', why: decl.why || '', ruleText: rule.text, sources: rule.sources || [] });
          info.push(ruleRef(m, rule, { tier2Pending: true }));
        }
        continue;
      }
      // calorie gating
      if (nut === 'kcal' && isDisabled('calorie-targets')) { suppressed.push(ruleRef(m, rule, { reason: { reason: 'feature-disabled', feature: 'calorie-targets' } })); continue; }

      switch (rule.kind) {
        case 'limit': applyNumber(rule, m, rule.value, {}); break;
        case 'target': applyNumber(rule, m, rule.value, {}); break;
        case 'avoid':
          for (const tag of rule.tags || []) {
            if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };
            if (rule.hard) avoid[tag].hard = true;
            avoid[tag].rules.push(ruleRef(m, rule));
          }
          applied.push(ruleRef(m, rule));
          break;
        case 'prefer':
          for (const tag of rule.tags || []) {
            if (!prefer[tag]) prefer[tag] = { rules: [] };
            prefer[tag].rules.push(ruleRef(m, rule));
          }
          applied.push(ruleRef(m, rule));
          break;
        case 'timing': timing.push(ruleRef(m, rule)); break;
        case 'behavior': behavior.push(ruleRef(m, rule)); break;
        default: info.push(ruleRef(m, rule));
      }
    }
  }

  function applyNumber(rule, m, value, meta) {
    const nut = rule.nutrient;
    if (!nut) { info.push(ruleRef(m, rule)); return; }
    let v = value;
    let scaled = false;
    if (rule.per_kg) {
      if (!weight) {
        notices.push({ level: 'info', code: 'weight-needed', module: m.id, text: `${m.name}: "${rule.text}" is per kilogram of body weight. Enter a weight to turn it into a daily number.` });
        info.push(ruleRef(m, rule, { needsWeight: true }));
        return;
      }
      v = Math.round(value * weight * 10) / 10;
      scaled = true;
    }
    const ref = ruleRef(m, rule, { value: v, raw: value, per_kg: !!rule.per_kg, ...meta });
    applied.push(ref);
    const op = rule.op || (rule.kind === 'limit' ? '<=' : '>=');
    if (op.startsWith('<')) {
      const cur = limits[nut];
      const ideal = rule.per_kg && rule.ideal ? Math.round(rule.ideal * weight * 10) / 10 : (rule.ideal ?? null);
      if (!cur) limits[nut] = { value: v, ideal, per: rule.per || 'day', rules: [ref], clinician: !!meta.clinician };
      else {
        if (v < cur.value) { cur.value = v; cur.clinician = !!meta.clinician; }
        if (ideal != null && (cur.ideal == null || ideal < cur.ideal)) cur.ideal = ideal;
        cur.rules.push(ref);
      }
    } else {
      const cur = targets[nut];
      const max = rule.max != null ? (rule.per_kg ? Math.round(rule.max * weight * 10) / 10 : rule.max) : null;
      if (!cur) targets[nut] = { min: v, max, per: rule.per || 'day', rules: [ref], clinician: !!meta.clinician };
      else {
        if (v > cur.min) { cur.min = v; cur.clinician = !!meta.clinician; }
        if (max != null && (cur.max == null || max < cur.max)) cur.max = max;
        cur.rules.push(ref);
      }
    }
    if (scaled) ref.note = `${value} per kg x ${weight} kg`;
  }

  // Winner conflicts: loser's prefer tags that the winner avoids are dropped
  for (const { winner, loser } of winnerPairs) {
    for (const tag of Object.keys(prefer)) {
      if (!avoid[tag]) continue;
      const before = prefer[tag].rules.length;
      prefer[tag].rules = prefer[tag].rules.filter(r => r.module !== loser);
      if (prefer[tag].rules.length !== before) suppressed.push({ module: loser, rule: `prefer:${tag}`, kind: 'prefer', text: `Preference for ${tag} set aside while ${labelFor(byId, winner)} rules apply.`, reason: { reason: 'winner', by: winner } });
      if (!prefer[tag].rules.length) delete prefer[tag];
    }
  }

  // User allergens: absolute
  for (const tag of person.allergens || []) {
    if (!avoid[tag]) avoid[tag] = { hard: true, rules: [] };
    avoid[tag].hard = true;
    avoid[tag].rules.push({ module: 'food-allergies', moduleName: 'Food allergies', rule: 'user-allergen', kind: 'avoid', text: 'Confirmed food allergy. Hard exclusion; no setting overrides it.', strength: 'must', tier: 1, sources: ['fda-falcpa-2004'], userAllergen: true });
  }
  // Preferences: soft
  for (const tag of (person.preferences && person.preferences.avoid_tags) || []) {
    if (!avoid[tag]) avoid[tag] = { hard: false, rules: [] };
    avoid[tag].rules.push({ module: 'preference-avoidances', moduleName: 'Preferences', rule: 'user-preference', kind: 'avoid', text: 'Personal preference. You can override this any time.', strength: 'may', tier: 1, sources: [], preference: true });
  }

  // Sanity: a target min above a limit max on the same nutrient
  for (const nut of Object.keys(targets)) {
    if (limits[nut] && targets[nut].min > limits[nut].value) notices.push({ level: 'warn', code: 'target-above-limit', text: `${labelNutrient(nut)}: one rule asks for at least ${targets[nut].min} and another for at most ${limits[nut].value}. Review both with a clinician.`, nutrient: nut });
  }

  // Restriction load
  const elim = ELIMINATION_MODULES.filter(id => activeIds.has(id));
  const prefAvoid = (person.preferences && person.preferences.avoid_tags) || [];
  if (prefAvoid.includes('allergen-milk') && !(person.allergens || []).includes('allergen-milk')) elim.push('dairy-free (preference)');
  const restrictionLoad = { count: elim.length, modules: elim, warn: elim.length >= 3 };
  if (restrictionLoad.warn) notices.push({ level: 'warn', code: 'restriction-load', text: `You have ${elim.length} elimination-style restrictions running at once. That is a lot of restriction, and the guidelines behind these protocols warn about it. Consider working with a dietitian, and do one elimination at a time where you can.` });

  for (const t of tier2Missing) notices.push({ level: 'warn', code: 'tier2-missing', module: t.module, text: `${t.moduleName}: ${t.label} was not applied. The app does not set this number. Enter the value your clinician gave you.${t.consensus ? ' Published range: ' + t.consensus : ''}` });
  for (const c of conflicts) {
    if (c.status === 'blocked') notices.push({ level: 'block', code: 'hard-conflict', text: `${c.aName} and ${c.bName} give opposite ${labelNutrient(c.param)} advice. The app will not choose. ${c.text}` });
    if (c.status === 'needs-ack') notices.push({ level: 'warn', code: 'needs-ack', ackKey: c.ackKey, text: `${c.aName} and ${c.bName}: ${c.text}` });
  }
  if (screenPositive) notices.push({ level: 'block', code: 'screen-positive', text: 'Based on your screening answers, calorie targets, weight-loss plans, and new elimination protocols are turned off. Allergen and celiac rules stay on. See the support resources on the Screening page.' });

  const order = { block: 0, warn: 1, info: 2 };
  notices.sort((a, b) => order[a.level] - order[b.level]);

  return {
    person: person.id,
    modules: active.map(m => ({ id: m.id, name: m.name, category: m.category, rating: m.evidence && m.evidence.rating })),
    disabledModules: [...disabledModules].map(([id, x]) => ({ id, ...x })),
    disabledFeatures: [...disabled].map(([feature, by]) => ({ feature, by })),
    isDisabled,
    limits, targets, avoid, prefer, timing, behavior, info,
    applied, suppressed, conflicts, phases,
    modes: [...activeModeRules].map(([module, x]) => ({ module, mode: x.mode })),
    tier2: { applied: tier2Applied, missing: tier2Missing },
    restrictionLoad,
    notices
  };
}

function labelFor(byId, id) {
  const m = byId.get(id);
  return m ? m.name : id;
}

export const NUTRIENT_LABELS = {
  kcal: 'Calories', protein_g: 'Protein (g)', carb_g: 'Carbohydrate (g)', fiber_g: 'Fiber (g)', sugar_g: 'Total sugars (g)', added_sugar_g: 'Added sugars (g)',
  fat_g: 'Total fat (g)', satfat_g: 'Saturated fat (g)', transfat_g: 'Trans fat (g)', cholesterol_mg: 'Cholesterol (mg)', sodium_mg: 'Sodium (mg)', potassium_mg: 'Potassium (mg)',
  phosphorus_mg: 'Phosphorus (mg)', calcium_mg: 'Calcium (mg)', iron_mg: 'Iron (mg)', magnesium_mg: 'Magnesium (mg)', vitamin_c_mg: 'Vitamin C (mg)', vitamin_d_iu: 'Vitamin D (IU)',
  vitamin_b12_ug: 'Vitamin B12 (mcg)', folate_ug: 'Folate (mcg)', zinc_mg: 'Zinc (mg)', iodine_ug: 'Iodine (mcg)', caffeine_mg: 'Caffeine (mg)', alcohol_g: 'Alcohol (g)', fluid_ml: 'Fluid (mL)',
  satfat_pct_kcal: 'Saturated fat (% of calories)', added_sugar_pct_kcal: 'Added sugar (% of calories)', carb_pct_kcal: 'Carbohydrate (% of calories)'
};
export function labelNutrient(n) {
  if (!n) return '';
  const base = n.replace(/_(max|min)$/, '');
  return NUTRIENT_LABELS[base] || base.replace(/_/g, ' ');
}
