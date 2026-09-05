import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/engine/plan.js';

const conditions = [
  { id: 'hypertension', name: 'Hypertension', category: 'condition', evidence: { rating: 'strong' }, sources: ['s1'],
    rules: [
      { id: 'htn-sodium', kind: 'limit', nutrient: 'sodium_mg', op: '<=', value: 2300, ideal: 1500, tier: 1, strength: 'must', text: 'Sodium under 2,300', sources: ['s1'] },
      { id: 'htn-potassium', kind: 'target', nutrient: 'potassium_mg', op: '>=', value: 3500, max: 5000, tier: 1, strength: 'should', text: 'Potassium 3,500 to 5,000', sources: ['s1'] },
      { id: 'htn-ssb', kind: 'avoid', tags: ['sugar-sweetened-beverage'], tier: 1, strength: 'should', text: 'Avoid SSB', sources: ['s1'] }
    ],
    conflicts: [ { with: 'pots', type: 'hard', param: 'sodium_mg', resolution: 'clinician', text: 'Opposite sodium advice.' }, { with: 'ckd', type: 'hard', param: 'potassium_mg', resolution: 'suppress:hypertension', text: 'CKD wins.' } ],
    medication_questions: [ { id: 'potassium_retaining', text: 'ACEi/ARB/MRA?', effect: 'suppress:htn-potassium' } ] },
  { id: 'pots', name: 'POTS', category: 'condition', evidence: { rating: 'limited' }, sources: ['s2'],
    tier2: [ { param: 'sodium_mg_min', label: 'Sodium target', consensus: '3 to 10 g/day', why: 'clinician sets' } ],
    rules: [ { id: 'pots-sodium', kind: 'target', nutrient: 'sodium_mg', op: '>=', value: 3000, tier: 2, strength: 'should', text: 'High sodium per clinician', sources: ['s2'] } ],
    conflicts: [ { with: 'hypertension', type: 'hard', param: 'sodium_mg', resolution: 'clinician', text: 'Opposite sodium advice.' } ] },
  { id: 'ckd', name: 'CKD', category: 'condition', evidence: { rating: 'strong' }, sources: ['s3'],
    rules: [ { id: 'ckd-protein', kind: 'limit', nutrient: 'protein_g', op: '<=', value: 0.8, per_kg: true, tier: 1, strength: 'should', text: '0.8 g/kg', sources: ['s3'] } ],
    conflicts: [ { with: 'hypertension', type: 'hard', param: 'potassium_mg', resolution: 'suppress:hypertension', text: 'CKD wins.' } ] },
  { id: 'ibs-low-fodmap', name: 'Low FODMAP', category: 'condition', evidence: { rating: 'moderate' }, sources: ['s4'],
    phases: [ { id: 'elimination', label: 'Elimination', min_weeks: 2, max_weeks: 6, rules: ['fm-elim'] }, { id: 'reintroduction', label: 'Reintroduction', min_weeks: 6, max_weeks: 8, rules: [] }, { id: 'personalization', label: 'Personalization', rules: [] } ],
    rules: [ { id: 'fm-elim', kind: 'avoid', tags: ['fodmap-fructan'], tier: 1, strength: 'should', text: 'Avoid fructans', sources: ['s4'] }, { id: 'fm-always', kind: 'behavior', text: 'Regular meals', tier: 1, strength: 'should', sources: ['s4'] } ] },
  { id: 'mcas', name: 'MCAS', category: 'condition', evidence: { rating: 'limited' }, sources: ['s5'], rules: [ { id: 'mc-1', kind: 'avoid', tags: ['histamine-high'], tier: 1, strength: 'may', text: 'trial', sources: ['s5'] } ] },
  { id: 'gluten-free-non-celiac', name: 'GF', category: 'pattern', evidence: { rating: 'limited' }, sources: ['s5'], rules: [ { id: 'gf-1', kind: 'avoid', tags: ['gluten'], tier: 1, strength: 'may', text: 'gf', sources: ['s5'] } ] },
  { id: 'pregnancy-gdm-breastfeeding', name: 'Pregnancy', category: 'condition', evidence: { rating: 'strong' }, sources: ['s6'], disables: ['weight-loss', 'ketogenic', 'elimination-protocols-except-allergen-celiac'], rules: [] },
  { id: 'low-carb-ketogenic', name: 'Keto', category: 'pattern', evidence: { rating: 'moderate' }, sources: ['s6'], rules: [ { id: 'k-1', kind: 'limit', nutrient: 'carb_g', op: '<=', value: 50, tier: 1, strength: 'should', text: 'carb', sources: ['s6'] } ] },
  { id: 'eating-disorder-screen', name: 'Screen', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s6'], disables: ['calorie-targets', 'weight-loss', 'new-elimination-protocols'], rules: [] },
  { id: 'food-allergies', name: 'Food allergies', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s7'], rules: [] },
  { id: 'ibd', name: 'IBD', category: 'condition', evidence: { rating: 'moderate' }, sources: ['s8'], modes: [ { id: 'remission', default: true, rules: ['ibd-rem'] }, { id: 'flare', label: 'Flare', expires_days: 14, rules: ['ibd-flare'] } ],
    rules: [ { id: 'ibd-rem', kind: 'prefer', tags: ['whole-grain'], tier: 1, strength: 'should', text: 'med diet', sources: ['s8'] }, { id: 'ibd-flare', kind: 'avoid', tags: ['raw-vegetable'], tier: 1, strength: 'should', text: 'low residue', sources: ['s8'] } ] }
];

function person(over = {}) {
  return { id: 'p1', name: 'T', adult: true, modules: [], allergens: [], preferences: { avoid_tags: [], avoid_terms: [] }, medications: {}, tier2: {}, phases: {}, modes: {}, acknowledged: [], screen: { positive: false }, ...over };
}

test('hypertension alone applies sodium limit and potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension'] }), conditions });
  assert.equal(plan.limits.sodium_mg.value, 2300);
  assert.equal(plan.limits.sodium_mg.ideal, 1500);
  assert.equal(plan.targets.potassium_mg.min, 3500);
  assert.ok(plan.avoid['sugar-sweetened-beverage']);
  assert.equal(plan.avoid['sugar-sweetened-beverage'].hard, false);
});

test('hypertension + POTS: no sodium number, hard-conflict notice, tier2 missing', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'pots'] }), conditions });
  assert.equal(plan.limits.sodium_mg, undefined);
  assert.equal(plan.targets.sodium_mg, undefined);
  assert.ok(plan.notices.some(n => n.code === 'hard-conflict'));
  assert.ok(plan.tier2.missing.some(t => t.param.startsWith('sodium_mg')));
  // rest of plan still builds
  assert.ok(plan.targets.potassium_mg);
});

test('hypertension + POTS with clinician sodium number applies that number', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'pots'], tier2: { sodium_mg_min: 4000, sodium_mg_max: 6000 } }), conditions });
  assert.equal(plan.targets.sodium_mg.min, 4000);
  assert.equal(plan.limits.sodium_mg.value, 6000);
  assert.equal(plan.limits.sodium_mg.clinician, true);
});

test('CKD suppresses hypertension potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension', 'ckd'], weight_kg: 70 }), conditions });
  assert.equal(plan.targets.potassium_mg, undefined);
  assert.ok(plan.suppressed.some(s => s.rule === 'htn-potassium'));
  assert.equal(plan.limits.protein_g.value, 56);
});

test('per-kg rule without weight asks for weight and applies nothing', () => {
  const plan = buildPlan({ person: person({ modules: ['ckd'] }), conditions });
  assert.equal(plan.limits.protein_g, undefined);
  assert.ok(plan.notices.some(n => n.code === 'weight-needed'));
});

test('medication answer suppresses potassium target', () => {
  const plan = buildPlan({ person: person({ modules: ['hypertension'], medications: { potassium_retaining: true } }), conditions });
  assert.equal(plan.targets.potassium_mg, undefined);
});

test('POTS tier 2 without number runs in tier 1 only with notice', () => {
  const plan = buildPlan({ person: person({ modules: ['pots'] }), conditions });
  assert.equal(plan.targets.sodium_mg, undefined);
  assert.ok(plan.notices.some(n => n.code === 'tier2-missing'));
  const p2 = buildPlan({ person: person({ modules: ['pots'], tier2: { sodium_mg_min: 5000 } }), conditions });
  assert.equal(p2.targets.sodium_mg.min, 5000);
});

test('phase gating: elimination rules apply in elimination, not in reintroduction; expiry blocks', () => {
  const today = new Date('2026-09-05');
  const p1 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-08-20' } } }), conditions, today });
  assert.ok(p1.avoid['fodmap-fructan']);
  assert.equal(p1.phases[0].status, 'ready-to-advance');
  const p2 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'reintroduction', started: '2026-08-20' } } }), conditions, today });
  assert.equal(p2.avoid['fodmap-fructan'], undefined);
  assert.ok(p2.behavior.some(b => b.rule === 'fm-always'));
  const p3 = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], phases: { 'ibs-low-fodmap': { phase: 'elimination', started: '2026-06-01' } } }), conditions, today });
  assert.equal(p3.phases[0].status, 'expired');
  assert.ok(p3.notices.some(n => n.code === 'phase-expired' && n.level === 'block'));
});

test('pregnancy disables keto and elimination protocols', () => {
  const plan = buildPlan({ person: person({ modules: ['low-carb-ketogenic', 'ibs-low-fodmap'], pregnancy: true }), conditions });
  assert.equal(plan.limits.carb_g, undefined);
  assert.ok(plan.disabledModules.some(d => d.id === 'low-carb-ketogenic'));
  assert.ok(plan.disabledModules.some(d => d.id === 'ibs-low-fodmap'));
});

test('positive screen turns off calorie targets and new eliminations but keeps allergens', () => {
  const plan = buildPlan({ person: person({ modules: ['ibs-low-fodmap'], allergens: ['allergen-peanut'], screen: { positive: true } }), conditions });
  assert.ok(plan.isDisabled('calorie-targets'));
  assert.ok(plan.disabledModules.some(d => d.id === 'ibs-low-fodmap'));
  assert.equal(plan.avoid['allergen-peanut'].hard, true);
});

test('allergens are hard even if also a preference', () => {
  const plan = buildPlan({ person: person({ allergens: ['allergen-milk'], preferences: { avoid_tags: ['allergen-milk'], avoid_terms: [] } }), conditions });
  assert.equal(plan.avoid['allergen-milk'].hard, true);
});

test('restriction load warns at three eliminations', () => {
  const plan = buildPlan({ person: person({ modules: ['ibs-low-fodmap', 'mcas', 'gluten-free-non-celiac'] }), conditions });
  assert.equal(plan.restrictionLoad.warn, true);
  assert.ok(plan.notices.some(n => n.code === 'restriction-load'));
});

test('IBD flare mode applies flare rules and expires', () => {
  const today = new Date('2026-09-05');
  const p1 = buildPlan({ person: person({ modules: ['ibd'], modes: { ibd: { mode: 'flare', since: '2026-09-01' } } }), conditions, today });
  assert.ok(p1.avoid['raw-vegetable']);
  assert.equal(p1.prefer['whole-grain'], undefined);
  const p2 = buildPlan({ person: person({ modules: ['ibd'], modes: { ibd: { mode: 'flare', since: '2026-08-01' } } }), conditions, today });
  assert.equal(p2.avoid['raw-vegetable'], undefined);
  assert.ok(p2.notices.some(n => n.code === 'mode-expired'));
});

test('allergy module applies only the person\'s own allergens (real content shape)', () => {
  const conds = [{ id: 'food-allergies', name: 'Food allergies', category: 'restriction', evidence: { rating: 'strong' }, sources: ['s7'], rules: [
    { id: 'allergen-soy', kind: 'avoid', hard: true, tags: ['allergen-soy', 'soy'], tier: 1, strength: 'must', text: 'soy', sources: ['s7'] },
    { id: 'allergen-peanut', kind: 'avoid', hard: true, tags: ['allergen-peanut'], tier: 1, strength: 'must', text: 'peanut', sources: ['s7'] }
  ] }];
  const plan = buildPlan({ person: person({ allergens: ['allergen-peanut'] }), conditions: conds });
  assert.equal(plan.avoid['allergen-peanut'].hard, true);
  assert.equal(plan.avoid['soy'], undefined);
  assert.equal(plan.avoid['allergen-soy'], undefined);
});
