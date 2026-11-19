import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { Backup } from '../src/db/backup';
import type { Candidate, Vacancy } from '../src/db/schema';

const vacancy: Vacancy = {
  id: 'custom-vacancy', title: 'Тестовая вакансия', department: 'ИТ', openedAt: '2026-01-01',
  status: 'open', salaryMin: 10, salaryMax: 20, competencies: [],
};
const candidate: Candidate = {
  id: 'sample', fullName: 'Sample Person', vacancyId: vacancy.id, contacts: {}, skills: [],
  source: 'referral', stage: 'hr_interview', stageHistory: [{ stage: 'hr_interview', enteredAt: '2026-01-02' }],
  scores: {}, offerDraft: {
    companyName: 'Example', mentorName: '', salary: '15', salaryBasis: 'net', startDate: '',
    probationMonths: '3', plan30: '', plan60: '', plan90: '',
  },
};

async function importBackup(page: Page, data: Backup) {
  await page.locator('input[accept=".json"]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)),
  });
}

async function exportBackup(page: Page): Promise<Backup> {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт IndexedDB' }).click();
  return JSON.parse(await readFile(await (await download).path(), 'utf8'));
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', async dialog => {
    expect(dialog.type(), dialog.message()).toBe('confirm');
    await dialog.accept();
  });
  await page.goto('/');
  await expect(page.getByLabel('Вакансия для нового кандидата')).toBeVisible();
});

test('restored vacancy is used by file and text import, then survives export and restart', async ({ page }) => {
  const secondVacancy = { ...vacancy, id: 'second-vacancy', title: 'Вторая вакансия' };
  await importBackup(page, { vacancies: [vacancy, secondVacancy], candidates: [candidate] });
  const selector = page.getByLabel('Вакансия для нового кандидата');
  await expect(selector).toHaveValue(vacancy.id);
  await page.locator('input[accept*=".txt"]').setInputFiles({
    name: 'sample.txt', mimeType: 'text/plain', buffer: Buffer.from('File Person\nfile@example.test'),
  });
  await expect(page.getByRole('button', { name: 'File Person', exact: true })).toHaveCount(1);
  const save = page.getByRole('button', { name: 'Сохранить в IndexedDB' });
  await expect(save).toBeDisabled();
  await selector.selectOption(secondVacancy.id);
  await page.locator('main textarea').fill('Text Person\ntext@example.test\n@sample_contact');
  await save.click();
  await expect(page.getByRole('button', { name: 'Text Person', exact: true })).toBeVisible();
  const copy = await exportBackup(page);
  expect(copy.candidates).toHaveLength(3);
  expect(copy.candidates).toContainEqual(candidate);
  const file = copy.candidates.find(c => c.fullName === 'File Person')!;
  expect(file.vacancyId).toBe(vacancy.id);
  expect(file.contacts).toEqual({ email: 'file@example.test' });
  expect(copy.candidates.find(c => c.fullName === 'Text Person')).toMatchObject({
    vacancyId: secondVacancy.id, contacts: { telegram: '@sample_contact' },
  });

  await importBackup(page, { vacancies: [], candidates: [] });
  await expect(page.getByRole('button', { name: 'Создать вакансию', exact: true })).toBeVisible();
  await importBackup(page, copy);
  await expect(selector).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Text Person', exact: true })).toBeVisible();
  const restored = await exportBackup(page);
  expect(restored.candidates).toEqual(copy.candidates);
  expect(restored.vacancies).toEqual(copy.vacancies);
});

test('orphaned links can be cancelled or explicitly repaired before replacing records', async ({ page }) => {
  const oldCopy = { vacancies: [], candidates: [candidate] };
  const before = await exportBackup(page);
  await importBackup(page, oldCopy);
  const dialog = page.getByRole('dialog');
  const restore = dialog.getByRole('button', { name: 'Восстановить базу' });
  await expect(restore).toBeDisabled();
  await dialog.getByRole('button', { name: 'Отмена' }).click();
  expect((await exportBackup(page)).candidates).toEqual(before.candidates);
  await importBackup(page, oldCopy);
  await dialog.getByLabel('Название новой вакансии').fill('Восстановленная вакансия');
  await dialog.getByRole('button', { name: 'Добавить вакансию в копию' }).click();
  await dialog.getByRole('combobox').selectOption({ label: 'Восстановленная вакансия' });
  await restore.click();
  await expect(dialog).toHaveCount(0);
  const repaired = await exportBackup(page);
  expect(repaired.vacancies).toHaveLength(1);
  expect(repaired.candidates).toEqual([{ ...candidate, vacancyId: repaired.vacancies[0].id }]);
  await importBackup(page, { vacancies: [], candidates: [] });
  await page.getByRole('button', { name: 'Создать вакансию', exact: true }).click();
  const selectedId = await page.getByLabel('Вакансия для нового кандидата').inputValue();
  expect(selectedId).toBe((await exportBackup(page)).vacancies[0].id);
});
