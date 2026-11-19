import { Candidate, CandidateStage, OfferDraft, Vacancy } from './schema';
import type { HRToolsDatabase } from './database';

export type Backup = { vacancies: Vacancy[]; candidates: Candidate[] };

export function unlinkedCandidates(backup: Backup): Candidate[] {
  const vacancies = new Set(backup.vacancies.map(vacancy => vacancy.id));
  return backup.candidates.filter(candidate => !vacancies.has(candidate.vacancyId));
}
const stages: CandidateStage[] = ['screening', 'hr_interview', 'tech_interview', 'security_check', 'offer', 'hired', 'rejected'];
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string';
const optionalString = (v: unknown) => v === undefined || str(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const stringArray = (v: unknown) => Array.isArray(v) && v.every(str);

function validOffer(v: unknown): v is OfferDraft {
  return record(v) && ['companyName', 'mentorName', 'salary', 'startDate', 'probationMonths', 'plan30', 'plan60', 'plan90'].every(k => str(v[k])) && (v.salaryBasis === 'net' || v.salaryBasis === 'gross');
}

export function parseBackup(text: string, options: { allowUnlinkedCandidates?: boolean } = {}): Backup {
  const data: unknown = JSON.parse(text);
  if (!record(data) || !Array.isArray(data.vacancies) || !Array.isArray(data.candidates)) throw new Error('В файле отсутствуют списки вакансий и кандидатов.');
  const vacancyIds = new Set<string>();
  for (const v of data.vacancies) {
    if (!record(v) || !str(v.id) || !v.id || vacancyIds.has(v.id) || !str(v.title) || !str(v.department) || !str(v.openedAt) || !optionalString(v.closedAt) || !number(v.salaryMin) || !number(v.salaryMax) || !['open', 'hold', 'closed'].includes(String(v.status)) || !Array.isArray(v.competencies)) throw new Error('Некорректная запись вакансии.');
    const ids = new Set<string>();
    for (const comp of v.competencies) {
      if (!record(comp) || !str(comp.id) || !comp.id || ids.has(comp.id) || !str(comp.name) || ![1, 2, 3].includes(Number(comp.weight)) || typeof comp.weight !== 'number' || !['hard', 'soft'].includes(String(comp.category)) || !str(comp.starPrompt)) throw new Error('Некорректная матрица компетенций.');
      ids.add(comp.id);
    }
    vacancyIds.add(v.id);
  }
  const candidateIds = new Set<string>();
  for (const c of data.candidates) {
    if (!record(c) || !str(c.id) || !c.id || candidateIds.has(c.id) || !str(c.vacancyId) || !str(c.fullName) || !record(c.contacts) || !['phone', 'email', 'telegram', 'github'].every(k => optionalString((c.contacts as Record<string, unknown>)[k])) || !stringArray(c.skills) || !['search', 'inbound', 'referral', 'headhunter'].includes(String(c.source)) || !stages.includes(c.stage as CandidateStage) || !optionalString(c.rejectionReason) || (c.expectedSalary !== undefined && !number(c.expectedSalary)) || !optionalString(c.rawResumeText) || !optionalString(c.aiSummary) || (c.offerDraft !== undefined && !validOffer(c.offerDraft)) || !Array.isArray(c.stageHistory) || !record(c.scores)) throw new Error('Некорректная запись кандидата.');
    if (!options.allowUnlinkedCandidates && !vacancyIds.has(c.vacancyId)) throw new Error('В копии отсутствует вакансия кандидата.');
    if (!c.stageHistory.every(h => record(h) && stages.includes(h.stage as CandidateStage) && str(h.enteredAt)) || !Object.values(c.scores).every(score => record(score) && number(score.score) && str(score.note))) throw new Error('Некорректная история этапов или оценки кандидата.');
    candidateIds.add(c.id);
  }
  return data as Backup;
}

export async function restoreBackup(database: HRToolsDatabase, backup: Backup): Promise<void> {
  if (unlinkedCandidates(backup).length) throw new Error('Выберите вакансию для каждого кандидата.');
  await database.transaction('rw', database.vacancies, database.candidates, database.metadata, async () => {
    await database.vacancies.clear();
    await database.candidates.clear();
    await database.vacancies.bulkPut(backup.vacancies);
    await database.candidates.bulkPut(backup.candidates);
    await database.metadata.put({ key: 'initialized', value: true });
    await database.metadata.put({ key: 'restoreId', value: crypto.randomUUID() });
  });
}

export function readBackup(database: HRToolsDatabase): Promise<Backup> {
  return database.transaction('r', database.vacancies, database.candidates, async () => ({
    vacancies: await database.vacancies.toArray(),
    candidates: await database.candidates.toArray()
  }));
}
