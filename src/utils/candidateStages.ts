import { Candidate, CandidateStage } from '../db/schema';

export function transitionCandidate(candidate: Candidate, stage: CandidateStage, reason: string | undefined, enteredAt: string): Candidate | null {
  if (candidate.stage === stage || (stage === 'rejected' && !reason)) return null;
  return {
    ...candidate,
    stage,
    rejectionReason: stage === 'rejected' ? reason : undefined,
    stageHistory: [...candidate.stageHistory, { stage, enteredAt }]
  };
}

export function filterCandidates(candidates: Candidate[], query: string, stage: string, vacancyId: string): Candidate[] {
  const q = query.trim().toLowerCase();
  return candidates.filter(c => {
    if (vacancyId !== 'all' && c.vacancyId !== vacancyId) return false;
    if (stage !== 'all' && c.stage !== stage) return false;
    return !q || c.fullName.toLowerCase().includes(q) || c.skills.some(s => s.toLowerCase().includes(q)) || !!c.rawResumeText?.toLowerCase().includes(q);
  });
}
