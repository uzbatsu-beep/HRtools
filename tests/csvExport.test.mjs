import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/csvExport.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const csv = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

test('CSV protects spreadsheet formulas and escapes delimiters, quotes and newlines', () => {
  for (const value of ['=1+1', ' +1', '-1', '@SUM(A1)', '\t=1']) {
    assert.ok(csv.escapeCsvCell(value).startsWith('"\''));
  }
  assert.equal(csv.escapeCsvCell('Иван; "Иванов"\nМосква'), '"Иван; ""Иванов"" Москва"');
  assert.equal(csv.escapeCsvCell(null), '""');
});

test('comparison export marks unscored candidates and shows score coverage', async () => {
  let blob;
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const oldDocument = globalThis.document;
  URL.createObjectURL = value => { blob = value; return 'blob:test'; };
  URL.revokeObjectURL = () => {};
  globalThis.document = { createElement: () => ({ click() {} }) };
  try {
    const vacancy = { id: 'v', salaryMin: 1, salaryMax: 2, competencies: [{ id: 'c1', name: 'A', weight: 1, category: 'hard' }, { id: 'c2', name: 'B', weight: 1, category: 'hard' }] };
    const people = [{ fullName: '=formula', stage: 'screening', scores: { c1: { score: 5, note: '' } }, skills: [] }, { fullName: 'Нет оценки', stage: 'screening', scores: {}, skills: [] }];
    csv.exportComparisonMatrixToCsv(vacancy, people, { screening: 'Скрининг' });
    const output = await blob.text();
    assert.deepEqual([...new Uint8Array(await blob.arrayBuffer()).slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.ok(output.includes('"\'=formula"'));
    assert.ok(output.includes('5 / 5.0 (1/2 оценено)'));
    assert.ok(output.includes('Не оценено'));
  } finally {
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
    globalThis.document = oldDocument;
  }
});
