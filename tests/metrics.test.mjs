import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/metricsMath.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { calculateFunnelMetrics, calculateRejectionBreakdown } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const labels = Object.fromEntries(['screening', 'hr_interview', 'tech_interview', 'security_check', 'offer', 'hired', 'rejected'].map(s => [s, s]));
const candidate = (vacancyId, stage, history, rejectionReason) => ({ vacancyId, stage, stageHistory: history.map(stage => ({ stage })), rejectionReason });

test('funnel counts recorded stages and handles skipped stages and returns', () => {
  const candidates = [
    candidate('a', 'rejected', ['screening', 'tech_interview', 'rejected'], 'reason'),
    candidate('a', 'screening', ['screening', 'hr_interview', 'screening']),
    candidate('b', 'offer', ['screening', 'offer'])
  ];
  const funnel = calculateFunnelMetrics(candidates, labels, 'a');
  assert.deepEqual(funnel.map(x => x.reachedCount), [2, 1, 1, 0, 0, 0]);
  assert.equal(funnel[1].conversionFromPrev, 50);
  assert.equal(funnel[2].conversionFromPrev, 0);
  assert.equal(funnel[0].currentCount, 1);
});

test('empty pools and rejection breakdown respect vacancy filter', () => {
  assert.ok(calculateFunnelMetrics([], labels).every(x => x.conversionFromTop === 0 && x.conversionFromPrev === 0));
  const candidates = [candidate('a', 'rejected', [], 'reason'), candidate('a', 'rejected', []), candidate('b', 'rejected', [], 'reason')];
  assert.deepEqual(calculateRejectionBreakdown(candidates, 'a'), [
    { reason: 'reason', count: 1, sharePercent: 50 },
    { reason: 'Причина не указана', count: 1, sharePercent: 50 }
  ]);
});
