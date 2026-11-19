import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/candidateStages.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { transitionCandidate, filterCandidates } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const candidate = { id: '1', vacancyId: 'a', fullName: 'Иван', skills: ['Python'], stage: 'screening', stageHistory: [{ stage: 'screening', enteredAt: '2026-01-01' }] };

test('transitions preserve history, ignore no-ops, and require a rejection reason', () => {
  assert.equal(transitionCandidate(candidate, 'screening', undefined, '2026-01-02'), null);
  assert.equal(transitionCandidate(candidate, 'rejected', undefined, '2026-01-02'), null);
  const rejected = transitionCandidate(candidate, 'rejected', 'Причина', '2026-01-02');
  assert.equal(rejected.rejectionReason, 'Причина');
  assert.deepEqual(rejected.stageHistory.map(x => x.stage), ['screening', 'rejected']);
  const returned = transitionCandidate(rejected, 'hr_interview', undefined, '2026-01-03');
  assert.equal(returned.rejectionReason, undefined);
  assert.equal(returned.stageHistory.length, 3);
  assert.equal(candidate.stageHistory.length, 1);
});

test('vacancy, stage and text filters are combined', () => {
  const candidates = [candidate, { ...candidate, id: '2', vacancyId: 'b' }, { ...candidate, id: '3', stage: 'offer' }];
  assert.deepEqual(filterCandidates(candidates, ' python ', 'screening', 'a').map(c => c.id), ['1']);
  assert.deepEqual(filterCandidates(candidates, '', 'all', 'b').map(c => c.id), ['2']);
  assert.equal(filterCandidates(candidates, 'other', 'all', 'all').length, 0);
});
