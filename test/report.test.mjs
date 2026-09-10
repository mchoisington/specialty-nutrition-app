// Doctor report analysis: episodes, foods eaten before symptoms, weight trend, day list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { symptomEpisodes, eatenBefore, foodsBeforeSymptoms, weightTrend, reportDays } from '../src/engine/report.js';

const P = 'mom';
const diary = [
  { person: P, date: '2026-09-01', meal: 'breakfast', kind: 'recipe', ref: 'oats', name: 'Oats' },
  { person: P, date: '2026-09-01', meal: 'dinner', kind: 'recipe', ref: 'tomato-pasta', name: 'Tomato pasta' },
  { person: P, date: '2026-09-02', meal: 'breakfast', kind: 'recipe', ref: 'oats', name: 'Oats' },
  { person: P, date: '2026-09-02', meal: 'lunch', kind: 'food', ref: 'banana', name: 'Banana' },
  { person: P, date: '2026-09-03', meal: 'breakfast', kind: 'recipe', ref: 'oats', name: 'Oats' },
  { person: P, date: '2026-09-03', meal: 'dinner', kind: 'recipe', ref: 'tomato-pasta', name: 'Tomato pasta' },
  { person: P, date: '2026-09-04', meal: 'breakfast', kind: 'recipe', ref: 'oats', name: 'Oats' },
  { person: 'other', date: '2026-09-04', meal: 'dinner', kind: 'recipe', ref: 'tomato-pasta', name: 'Tomato pasta' }
];
const log = [
  { person: P, date: '2026-09-02', meal: 'symptom', symptoms: { flushing: 2 }, at: '2026-09-02T08:30:00.000Z' },
  { person: P, date: '2026-09-03', meal: 'day', symptoms: {}, fine: true },
  { person: P, date: '2026-09-04', meal: 'symptom', symptoms: { flushing: 3, headache: 1 }, at: '2026-09-04T09:00:00.000Z' },
  { person: 'other', date: '2026-09-04', meal: 'symptom', symptoms: { flushing: 3 }, at: '2026-09-04T09:00:00.000Z' }
];
const weights = [{ person: P, date: '2026-09-01', kg: 52 }, { person: P, date: '2026-09-04', kg: 51.2 }, { person: 'other', date: '2026-09-04', kg: 80 }];

test('episodes: only this person, only entries with a symptom above zero, in range', () => {
  const eps = symptomEpisodes(log, P, '2026-09-01', '2026-09-30');
  assert.equal(eps.length, 2);
  assert.deepEqual(eps.map(e => e.date), ['2026-09-02', '2026-09-04']);
  assert.equal(eps[1].worst, 3);
  assert.equal(symptomEpisodes(log, P, '2026-09-03', '2026-09-03').length, 0, 'a "feeling fine" day is not an episode');
});

test('eaten before an episode: the 24 hours before it, this person only', () => {
  const eps = symptomEpisodes(log, P, '2026-09-01', '2026-09-30');
  const before = eatenBefore(diary, eps[1], 24).map(e => e.date + ':' + e.ref);
  assert.ok(before.includes('2026-09-03:tomato-pasta'), 'dinner the night before');
  assert.ok(!before.includes('2026-09-02:banana'), 'two days back is outside the window');
  assert.ok(!before.some(x => x.includes('other')));
});

test('foods before symptoms are ranked by how many episodes they preceded, and counts are honest', () => {
  const rows = foodsBeforeSymptoms(diary, log, P, '2026-09-01', '2026-09-30', 24);
  const pasta = rows.find(r => r.key === 'recipe:tomato-pasta');
  const oats = rows.find(r => r.key === 'recipe:oats');
  assert.ok(pasta && oats);
  assert.equal(pasta.episodes, 2, 'pasta was eaten the evening before both episodes');
  assert.equal(pasta.total, 2);
  assert.equal(oats.total, 4, 'oats every morning');
  assert.equal(rows[0].key, 'recipe:tomato-pasta');
  assert.ok(!rows.some(r => r.key === 'food:banana'), 'banana never preceded an episode');
});

test('weight trend and the day list, with the symptom-only option', () => {
  const wt = weightTrend(weights, P, '2026-09-01', '2026-09-30');
  assert.equal(wt.points.length, 2);
  assert.equal(wt.changeKg, -0.8);
  const all = reportDays({ diary, log, weights, personId: P, from: '2026-09-01', to: '2026-09-05', onlySymptomDays: false });
  assert.deepEqual(all.map(d => d.date), ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']);
  const sym = reportDays({ diary, log, weights, personId: P, from: '2026-09-01', to: '2026-09-05', onlySymptomDays: true });
  assert.deepEqual(sym.map(d => d.date), ['2026-09-02', '2026-09-04']);
  assert.equal(sym[1].episodes.length, 1);
  assert.equal(sym[1].weight.kg, 51.2);
});
