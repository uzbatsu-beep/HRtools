import Dexie, { Table } from 'dexie';
import { Vacancy, Candidate } from './schema';
import { INITIAL_VACANCIES, INITIAL_CANDIDATES } from './seed';

export class HRToolsDatabase extends Dexie {
  vacancies!: Table<Vacancy, string>;
  candidates!: Table<Candidate, string>;

  constructor() {
    super('HRToolsIndexedDB');
    // Индексы: *skills — мульти-индекс для мгновенного поиска по технологиям
    this.version(1).stores({
      vacancies: 'id, title, department, status, openedAt',
      candidates: 'id, vacancyId, fullName, stage, expectedSalary, *skills'
    });
  }
}

export const db = new HRToolsDatabase();

export async function initAndMigrateDatabase(): Promise<{
  vacancies: Vacancy[];
  candidates: Candidate[];
}> {
  const existingVacanciesCount = await db.vacancies.count();

  if (existingVacanciesCount === 0) {
    // Проверяем, есть ли старые данные в localStorage от версий v0.1.0 / v0.2.0
    const legacyVacanciesRaw = localStorage.getItem('hr_toolkit_vacancies');
    const legacyCandidatesRaw = localStorage.getItem('hr_toolkit_candidates');

    const seedVacancies: Vacancy[] = legacyVacanciesRaw
      ? JSON.parse(legacyVacanciesRaw)
      : INITIAL_VACANCIES;

    const seedCandidates: Candidate[] = legacyCandidatesRaw
      ? JSON.parse(legacyCandidatesRaw)
      : INITIAL_CANDIDATES;

    await db.transaction('rw', db.vacancies, db.candidates, async () => {
      await db.vacancies.bulkPut(seedVacancies);
      await db.candidates.bulkPut(seedCandidates);
    });
  }

  const [vacancies, candidates] = await Promise.all([
    db.vacancies.toArray(),
    db.candidates.reverse().toArray()
  ]);

  return { vacancies, candidates };
}
