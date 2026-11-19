import Dexie, { Table } from 'dexie';
import { Vacancy, Candidate } from './schema';
import { INITIAL_VACANCIES, INITIAL_CANDIDATES } from './seed';

export class HRToolsDatabase extends Dexie {
  vacancies!: Table<Vacancy, string>;
  candidates!: Table<Candidate, string>;
  metadata!: Table<{ key: string; value: boolean | string }, string>;

  constructor(name = 'HRToolsIndexedDB') {
    super(name);
    // Индексы: *skills — мульти-индекс для мгновенного поиска по технологиям
    this.version(1).stores({
      vacancies: 'id, title, department, status, openedAt',
      candidates: 'id, vacancyId, fullName, stage, expectedSalary, *skills'
    });
    this.version(2).stores({ metadata: 'key' });
  }
}

export const db = new HRToolsDatabase();

export async function getRestoreId(database: HRToolsDatabase) {
  const entry = await database.metadata.get('restoreId');
  return typeof entry?.value === 'string' ? entry.value : '';
}

export async function addCandidates(database: HRToolsDatabase, candidates: Candidate[], restoreId: string) {
  await database.transaction('rw', database.metadata, database.vacancies, database.candidates, async () => {
    if (restoreId !== await getRestoreId(database)) throw new Error('База была восстановлена. Выберите вакансию и повторите добавление.');
    const vacancyIds = [...new Set(candidates.map(candidate => candidate.vacancyId))];
    const vacancies = await database.vacancies.bulkGet(vacancyIds);
    if (vacancies.some(vacancy => !vacancy)) {
      throw new Error('Выбранная вакансия отсутствует. Обновите список вакансий и повторите добавление.');
    }
    await database.candidates.bulkAdd(candidates);
  });
}

export function saveAiSummary(database: HRToolsDatabase, id: string, summary: string, restoreId: string) {
  return database.transaction('rw', database.metadata, database.candidates, async () => {
    if (restoreId !== await getRestoreId(database)) return false;
    return (await database.candidates.update(id, { aiSummary: summary })) === 1;
  });
}

export async function initAndMigrateDatabase(database = db): Promise<{
  vacancies: Vacancy[];
  candidates: Candidate[];
}> {
  const existingVacanciesCount = await database.vacancies.count();
  const existingCandidatesCount = await database.candidates.count();
  const initialized = await database.metadata.get('initialized');

  if (!initialized && existingVacanciesCount === 0 && existingCandidatesCount === 0) {
    // Проверяем, есть ли старые данные в localStorage от версий v0.1.0 / v0.2.0
    const legacyVacanciesRaw = localStorage.getItem('hr_toolkit_vacancies');
    const legacyCandidatesRaw = localStorage.getItem('hr_toolkit_candidates');

    const seedVacancies: Vacancy[] = legacyVacanciesRaw
      ? JSON.parse(legacyVacanciesRaw)
      : INITIAL_VACANCIES;

    const seedCandidates: Candidate[] = legacyCandidatesRaw
      ? JSON.parse(legacyCandidatesRaw)
      : INITIAL_CANDIDATES;

    await database.transaction('rw', database.vacancies, database.candidates, database.metadata, async () => {
      await database.vacancies.bulkPut(seedVacancies);
      await database.candidates.bulkPut(seedCandidates);
      await database.metadata.put({ key: 'initialized', value: true });
    });
  } else if (!initialized) {
    await database.metadata.put({ key: 'initialized', value: true });
  }

  const [vacancies, candidates] = await Promise.all([
    database.vacancies.toArray(),
    database.candidates.reverse().toArray()
  ]);

  return { vacancies, candidates };
}
