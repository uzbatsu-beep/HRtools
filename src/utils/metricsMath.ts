import { Candidate, CandidateStage, Competency } from '../db/schema';

export function getDaysInCurrentStage(candidate: Candidate): number {
  const history = candidate.stageHistory;
  if (!history || history.length === 0) return 0;
  const lastEntry = history[history.length - 1];
  const entered = new Date(lastEntry.enteredAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - entered) / (1000 * 60 * 60 * 24)));
}

export function calculateWeightedScore(
  competencies: Competency[],
  scores: Record<string, { score: number; note: string }>
): number {
  let totalWeight = 0;
  let weightedSum = 0;

  for (const comp of competencies) {
    const entry = scores[comp.id];
    if (entry && entry.score > 0) {
      weightedSum += entry.score * comp.weight;
      totalWeight += comp.weight;
    }
  }
  return totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(2)) : 0;
}

export function calculateCompaRatio(salary: number, minGrade: number, maxGrade: number) {
  const midpoint = (minGrade + maxGrade) / 2;
  if (midpoint <= 0) return { ratio: 0, midpoint: 0, zone: 'Нет данных' };
  const ratio = Number(((salary / midpoint) * 100).toFixed(1));
  
  let zone = 'В рынке (Оптимум 90–110%)';
  if (ratio < 85) zone = 'Риск ухода: Ниже рынка (<85%)';
  else if (ratio > 115) zone = 'Перегрев ФОТ: Выше вилки (>115%)';

  return { ratio, midpoint, zone };
}

export interface TurnoverCostParams {
  monthlySalary: number;
  daysToFill: number;
  onboardingMonths: number;
  hrHoursSpent: number;
  managerHoursSpent: number;
  hourlyRateAvg: number;
  externalAdsCost: number;
}

export function calculateTurnoverCost(p: TurnoverCostParams) {
  const dailySalary = p.monthlySalary / 21;
  const vacancyLoss = Math.round(dailySalary * p.daysToFill * 0.5);
  const rampUpLoss = Math.round(p.monthlySalary * p.onboardingMonths * 0.5);
  const hiringCost = Math.round((p.hrHoursSpent + p.managerHoursSpent) * p.hourlyRateAvg + p.externalAdsCost);

  const totalCost = vacancyLoss + rampUpLoss + hiringCost;
  const salaryMultiplier = p.monthlySalary > 0 ? Number((totalCost / p.monthlySalary).toFixed(1)) : 0;

  return { vacancyLoss, rampUpLoss, hiringCost, totalCost, salaryMultiplier };
}

// --- Аналитика воронки рекрутинга и узких горлышек (v0.4.0) ---

const FUNNEL_ORDER: CandidateStage[] = [
  'screening',
  'hr_interview',
  'tech_interview',
  'security_check',
  'offer',
  'hired'
];

export interface FunnelStepMetric {
  stage: CandidateStage;
  label: string;
  reachedCount: number;     // Кандидаты с записью об этапе или текущим этапом
  currentCount: number;     // Сколько прямо сейчас находятся на этапе
  conversionFromTop: number; // % от всех кандидатов на входе
  conversionFromPrev: number; // % перехода с предыдущего этапа
}

export function calculateFunnelMetrics(
  candidates: Candidate[],
  stageLabels: Record<CandidateStage, string>,
  vacancyIdFilter: string = 'all'
): FunnelStepMetric[] {
  const pool = vacancyIdFilter === 'all'
    ? candidates
    : candidates.filter(c => c.vacancyId === vacancyIdFilter);

  const total = pool.length;

  const reached = (candidate: Candidate, stage: CandidateStage) =>
    candidate.stage === stage || candidate.stageHistory?.some(entry => entry.stage === stage);

  return FUNNEL_ORDER.map((stage, idx) => {
    const reachedCount = pool.filter(c => reached(c, stage)).length;

    const currentCount = pool.filter(c => c.stage === stage).length;
    const conversionFromTop = total > 0 ? Math.round((reachedCount / total) * 100) : 0;

    const previous = idx > 0 ? pool.filter(c => reached(c, FUNNEL_ORDER[idx - 1])) : pool;
    const transitioned = previous.filter(c => reached(c, stage)).length;
    const conversionFromPrev = previous.length ? Math.round((transitioned / previous.length) * 100) : 0;

    return {
      stage,
      label: stageLabels[stage],
      reachedCount,
      currentCount,
      conversionFromTop,
      conversionFromPrev
    };
  });
}

export interface RejectionMetric {
  reason: string;
  count: number;
  sharePercent: number;
}

export function calculateRejectionBreakdown(
  candidates: Candidate[],
  vacancyIdFilter: string = 'all'
): RejectionMetric[] {
  const rejected = (vacancyIdFilter === 'all'
    ? candidates
    : candidates.filter(c => c.vacancyId === vacancyIdFilter)
  ).filter(c => c.stage === 'rejected');

  const totalRejected = rejected.length;
  if (totalRejected === 0) return [];

  const counts: Record<string, number> = {};
  for (const c of rejected) {
    const key = c.rejectionReason || 'Причина не указана';
    counts[key] = (counts[key] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([reason, count]) => ({
      reason,
      count,
      sharePercent: Math.round((count / totalRejected) * 100)
    }))
    .sort((a, b) => b.count - a.count);
}
