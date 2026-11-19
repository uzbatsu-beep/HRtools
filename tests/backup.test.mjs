import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
import { build } from 'esbuild';

const bundle = await build({ stdin: { contents: "export * from './src/db/database'; export * from './src/db/backup';", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node' });
const { HRToolsDatabase, initAndMigrateDatabase, parseBackup, restoreBackup, addCandidates, getRestoreId, saveAiSummary } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);
const vacancy = { id: 'v', title: 'Разработчик', department: 'ИТ', openedAt: '2026-11-19', salaryMin: 10, salaryMax: 20, status: 'open', competencies: [] };
const draft = { companyName: 'Тест', mentorName: '', salary: '123', salaryBasis: 'gross', startDate: '2026-12-01', probationMonths: '3', plan30: 'Задача', plan60: '', plan90: '' };
const candidate = { id: 'c', vacancyId: 'v', fullName: 'Кандидат', contacts: {}, skills: [], source: 'search', stage: 'screening', expectedSalary: 100, stageHistory: [], scores: {}, offerDraft: draft };

test('backup restores a saved offer independently of salary expectations after reopening', async () => {
  const name = `hrtools-test-${crypto.randomUUID()}`;
  const db = new HRToolsDatabase(name);
  try {
    const backup = parseBackup(JSON.stringify({ vacancies: [vacancy], candidates: [candidate] }));
    await restoreBackup(db, backup);
    db.close();
    const reopened = new HRToolsDatabase(name);
    try {
      const restored = await reopened.candidates.get('c');
      assert.equal(restored.expectedSalary, 100);
      assert.deepEqual(restored.offerDraft, draft);
    } finally { reopened.close(); }
  } finally { await db.delete(); }
});

test('restored empty database stays empty on restart', async () => {
  const name = `hrtools-test-${crypto.randomUUID()}`;
  const db = new HRToolsDatabase(name);
  try {
    await restoreBackup(db, parseBackup(JSON.stringify({ vacancies: [], candidates: [] })));
    db.close();
    const reopened = new HRToolsDatabase(name);
    try { assert.deepEqual(await initAndMigrateDatabase(reopened), { vacancies: [], candidates: [] }); }
    finally { reopened.close(); }
  } finally { await db.delete(); }
});

test('version 1 databases migrate without replacing existing records', async () => {
  const name = `hrtools-test-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({ vacancies: 'id, title, department, status, openedAt', candidates: 'id, vacancyId, fullName, stage, expectedSalary, *skills' });
  await legacy.table('vacancies').put(vacancy);
  await legacy.table('candidates').put(candidate);
  legacy.close();
  const upgraded = new HRToolsDatabase(name);
  try {
    const restored = await initAndMigrateDatabase(upgraded);
    assert.deepEqual(restored.candidates[0].offerDraft, draft);
    assert.equal(restored.vacancies[0].title, vacancy.title);
  } finally { await upgraded.delete(); }
});

test('invalid backups are rejected and database transaction rolls back on failure', async () => {
  const db = new HRToolsDatabase(`hrtools-test-${crypto.randomUUID()}`);
  try {
    await restoreBackup(db, parseBackup(JSON.stringify({ vacancies: [vacancy], candidates: [candidate] })));
    assert.throws(() => parseBackup(JSON.stringify({ vacancies: [vacancy], candidates: [{ ...candidate, skills: null }] })));
    assert.throws(() => parseBackup(JSON.stringify({ vacancies: [vacancy], candidates: [{ ...candidate, vacancyId: 'missing' }] })));
    await assert.rejects(restoreBackup(db, { vacancies: [{ ...vacancy, id: undefined }], candidates: [] }));
    assert.equal((await db.candidates.get('c')).fullName, 'Кандидат');
    assert.equal((await db.vacancies.get('v')).title, 'Разработчик');
  } finally { await db.delete(); }
});

test('missing vacancies or a changed database cancel the whole resume import', async () => {
  const db = new HRToolsDatabase(`hrtools-test-${crypto.randomUUID()}`);
  try {
    const copy = { vacancies: [vacancy], candidates: [] };
    await restoreBackup(db, copy);
    const restoreId = await getRestoreId(db);
    await assert.rejects(addCandidates(db, [candidate, { ...candidate, id: 'other', vacancyId: 'gone' }], restoreId));
    assert.equal(await db.candidates.count(), 0);
    await restoreBackup(db, copy);
    await assert.rejects(addCandidates(db, [candidate], restoreId));
    assert.equal(await db.candidates.count(), 0);
  } finally { await db.delete(); }
});

test('a late AI response preserves edits and respects deletion and database replacement', async () => {
  const db = new HRToolsDatabase(`hrtools-test-${crypto.randomUUID()}`);
  try {
    const copy = { vacancies: [vacancy], candidates: [candidate] };
    await restoreBackup(db, copy);
    const restoreId = await getRestoreId(db);
    await db.candidates.update(candidate.id, { stage: 'offer', contacts: { phone: '123' } });
    assert.equal(await saveAiSummary(db, candidate.id, 'summary', restoreId), true);
    assert.deepEqual(await db.candidates.get(candidate.id), { ...candidate, stage: 'offer', contacts: { phone: '123' }, aiSummary: 'summary' });
    await db.candidates.delete(candidate.id);
    assert.equal(await saveAiSummary(db, candidate.id, 'late', restoreId), false);
    assert.equal(await db.candidates.count(), 0);
    await restoreBackup(db, copy);
    assert.equal(await saveAiSummary(db, candidate.id, 'late', restoreId), false);
    assert.deepEqual(await db.candidates.get(candidate.id), candidate);
  } finally { await db.delete(); }
});
