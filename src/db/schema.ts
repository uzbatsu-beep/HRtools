export type CandidateStage = 
  | 'screening' 
  | 'hr_interview' 
  | 'tech_interview' 
  | 'security_check' 
  | 'offer' 
  | 'hired' 
  | 'rejected';

export interface Competency {
  id: string;
  name: string;
  weight: 1 | 2 | 3;
  category: 'hard' | 'soft';
  starPrompt: string;
}

export interface Vacancy {
  id: string;
  title: string;
  department: string;
  openedAt: string;
  closedAt?: string;
  salaryMin: number;
  salaryMax: number;
  status: 'open' | 'hold' | 'closed';
  competencies: Competency[];
}

export interface StageHistoryEntry {
  stage: CandidateStage;
  enteredAt: string;
}

export interface Candidate {
  id: string;
  vacancyId: string;
  fullName: string;
  contacts: {
    phone?: string;
    email?: string;
    telegram?: string;
    github?: string;
  };
  skills: string[];
  source: 'search' | 'inbound' | 'referral' | 'headhunter';
  stage: CandidateStage;
  rejectionReason?: string;
  expectedSalary?: number;
  stageHistory: StageHistoryEntry[];
  scores: Record<string, { score: number; note: string }>;
  rawResumeText?: string;
}

export interface BooleanPreset {
  id: string;
  name: string;
  titles: string[];
  mustHave: string[];
  alternatives: string[];
  exclude: string[];
}