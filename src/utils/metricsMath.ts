import { Candidate, Competency } from '../db/schema';

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