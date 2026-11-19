import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, Users, ClipboardCheck, BarChart3, FileText, Briefcase,
  Download, Upload, Copy, Plus, FileUp, Loader2, CheckCircle2,
  Database, Cpu, Sparkles, Trash2, Columns, FileSpreadsheet, GripVertical
} from 'lucide-react';
import { Vacancy, Candidate, CandidateStage, Competency } from './db/schema';
import { BOOLEAN_PRESETS, REJECTION_REASONS } from './db/seed';
import { db, initAndMigrateDatabase } from './db/database';
import { parseBackup, restoreBackup } from './db/backup';
import { parseRawResumeText } from './utils/cvParser';
import { extractTextFromFile } from './utils/fileExtractor';
import { DEFAULT_LLM_CONFIG, analyzeCandidateWithLocalLlm } from './utils/localLlm';
import { filterCandidates, transitionCandidate } from './utils/candidateStages';
import { CandidateDossier } from './components/CandidateDossier';
import { OfferEditor } from './components/OfferEditor';
import { 
  getDaysInCurrentStage, 
  calculateWeightedScore, 
  calculateCompaRatio, 
  calculateTurnoverCost,
  calculateFunnelMetrics,
  calculateRejectionBreakdown
} from './utils/metricsMath';
import {
  exportCandidatesToCsv,
  exportAnalyticsToCsv,
  exportComparisonMatrixToCsv
} from './utils/csvExport';

const STAGE_LABELS: Record<CandidateStage, string> = {
  screening: '1. Скрининг',
  hr_interview: '2. HR-интервью',
  tech_interview: '3. Тех. интервью',
  security_check: '4. Проверка СБ',
  offer: '5. Оффер',
  hired: '6. Нанят',
  rejected: 'Отказ'
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'boolean' | 'vacancies' | 'ats' | 'scorecard' | 'compare' | 'analytics' | 'docs'>('ats');
  const [offerDirty, setOfferDirty] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [databaseRevision, setDatabaseRevision] = useState(0);
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // Поиск и фильтрация по IndexedDB
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [vacancyFilter, setVacancyFilter] = useState('all');
  const [atsViewMode, setAtsViewMode] = useState<'kanban' | 'table'>('kanban');
  const [draggedCandId, setDraggedCandId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<CandidateStage | null>(null);
  const [analyticsVacancyFilter, setAnalyticsVacancyFilter] = useState<string>('all');

  // Состояние модуля сравнения кандидатов (Side-by-Side v0.5.0)
  const [compareVacancyId, setCompareVacancyId] = useState<string>('vac-1');
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);


  // Конфигурация локальной LLM (LM Studio / Ollama)
  const [llmEndpoint, setLlmEndpoint] = useState(
    () => localStorage.getItem('hr_llm_endpoint') || DEFAULT_LLM_CONFIG.endpoint
  );
  const [llmModel, setLlmModel] = useState(
    () => localStorage.getItem('hr_llm_model') || DEFAULT_LLM_CONFIG.model
  );
  const [aiLoadingCandId, setAiLoadingCandId] = useState<string | null>(null);

  useEffect(() => {
    initAndMigrateDatabase().then(({ vacancies: v, candidates: c }) => {
      setVacancies(v);
      setCandidates(c);
      const initialVacId = v[0]?.id || 'vac-1';
      setCompareVacancyId(initialVacId);
      const initialPool = c.filter(cand => cand.vacancyId === initialVacId).slice(0, 3).map(cand => cand.id);
      setSelectedCompareIds(initialPool);
      setDbReady(true);
    });
  }, []);

  const saveLlmSettings = (endpoint: string, model: string) => {
    setLlmEndpoint(endpoint);
    setLlmModel(model);
    localStorage.setItem('hr_llm_endpoint', endpoint);
    localStorage.setItem('hr_llm_model', model);
  };

  // --- Модуль 1: Boolean Builder ---
  const [bTitles, setBTitles] = useState(BOOLEAN_PRESETS[0].titles.join(', '));
  const [bMust, setBMust] = useState(BOOLEAN_PRESETS[0].mustHave.join(', '));
  const [bAlt, setBAlt] = useState(BOOLEAN_PRESETS[0].alternatives.join(', '));
  const [bNot, setBNot] = useState(BOOLEAN_PRESETS[0].exclude.join(', '));
  const [bLoc] = useState('Оренбург OR Екатеринбург OR Уфа');

  const applyPreset = (presetId: string) => {
    const p = BOOLEAN_PRESETS.find(item => item.id === presetId);
    if (!p) return;
    setBTitles(p.titles.join(', '));
    setBMust(p.mustHave.join(', '));
    setBAlt(p.alternatives.join(', '));
    setBNot(p.exclude.join(', '));
  };

  const booleanQueries = useMemo(() => {
    const fmtOr = (str: string) => {
      const items = str.split(',').map(s => s.trim()).filter(Boolean);
      if (!items.length) return '';
      return `(${items.map(i => i.includes(' ') ? `"${i}"` : i).join(' OR ')})`;
    };
    const fmtAnd = (str: string) => {
      const items = str.split(',').map(s => s.trim()).filter(Boolean);
      return items.map(i => i.includes(' ') ? `"${i}"` : i).join(' AND ');
    };
    const fmtNot = (str: string) => {
      const items = str.split(',').map(s => s.trim()).filter(Boolean);
      return items.map(i => `-${i.includes(' ') ? `"${i}"` : i}`).join(' ');
    };

    const core = [fmtOr(bTitles), fmtAnd(bMust), fmtOr(bAlt), bLoc ? `(${bLoc})` : '', fmtNot(bNot)]
      .filter(Boolean).join(' ');

    return {
      universal: core,
      habrXray: `site:career.habr.com ${core}`,
      githubXray: `site:github.com ${fmtAnd(bMust)} ${fmtOr(bAlt)}`,
      pdfResumes: `filetype:pdf (резюме OR CV) ${core}`
    };
  }, [bTitles, bMust, bAlt, bNot, bLoc]);

  // --- Модуль 2: Конструктор Вакансий и Матриц компетенций (v0.4.0) ---
  const [editingVacancyId, setEditingVacancyId] = useState<string>('vac-1');
  const currentEditingVacancy = vacancies.find(v => v.id === editingVacancyId) || vacancies[0];

  const [newCompName, setNewCompName] = useState('');
  const [newCompWeight, setNewCompWeight] = useState<1 | 2 | 3>(2);
  const [newCompCategory, setNewCompCategory] = useState<'hard' | 'soft'>('hard');
  const [newCompPrompt, setNewCompPrompt] = useState('');

  const handleCreateVacancy = async () => {
    const newVac: Vacancy = {
      id: `vac-${Date.now()}`,
      title: 'Новая инженерная вакансия',
      department: 'Производственный департамент',
      openedAt: new Date().toISOString().slice(0, 10),
      salaryMin: 150000,
      salaryMax: 210000,
      status: 'open',
      competencies: [
        {
          id: `comp-${Date.now()}`,
          name: 'Профильная техническая экспертиза',
          weight: 3,
          category: 'hard',
          starPrompt: 'Расскажите о самом технически сложном проекте за последние 2 года и вашей личной роли в нем.'
        }
      ]
    };
    await db.vacancies.put(newVac);
    setVacancies(prev => [...prev, newVac]);
    setEditingVacancyId(newVac.id);
  };

  const handleUpdateVacancyField = async (patch: Partial<Vacancy>) => {
    if (!currentEditingVacancy) return;
    const id = currentEditingVacancy.id;
    setVacancies(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
    try {
      await db.vacancies.update(id, patch);
    } catch {
      setVacancies(await db.vacancies.toArray());
      alert('Не удалось сохранить изменения вакансии.');
    }
  };

  const handleAddCompetency = async () => {
    if (!currentEditingVacancy || !newCompName.trim()) return;
    const comp: Competency = {
      id: `comp-${Date.now()}`,
      name: newCompName.trim(),
      weight: newCompWeight,
      category: newCompCategory,
      starPrompt: newCompPrompt.trim() || 'Опишите конкретную рабочую ситуацию (Situation, Task, Action, Result), где проявился этот навык.'
    };
    const updated: Vacancy = {
      ...currentEditingVacancy,
      competencies: [...currentEditingVacancy.competencies, comp]
    };
    await db.vacancies.put(updated);
    setVacancies(prev => prev.map(v => v.id === updated.id ? updated : v));
    setNewCompName('');
    setNewCompPrompt('');
  };

  const handleRemoveCompetency = async (compId: string) => {
    if (!currentEditingVacancy) return;
    if (candidates.some(c => c.vacancyId === currentEditingVacancy.id && c.scores[compId]) &&
      !window.confirm('По этой компетенции есть оценки кандидатов. После удаления они не будут учитываться в скоркарте. Удалить компетенцию?')) return;
    const updated: Vacancy = {
      ...currentEditingVacancy,
      competencies: currentEditingVacancy.competencies.filter(c => c.id !== compId)
    };
    await db.vacancies.put(updated);
    setVacancies(prev => prev.map(v => v.id === updated.id ? updated : v));
  };

  // --- Модуль 3: Мини-ATS + IndexedDB + Drag-and-Drop ---
  const [rawCvInput, setRawCvInput] = useState('');
  const [selectedVacancyId, setSelectedVacancyId] = useState('vac-1');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const createCandidateFromText = (text: string, fallbackName?: string): Candidate => {
    const parsed = parseRawResumeText(text);
    const cleanFileName = fallbackName?.replace(/\.(pdf|docx|txt|md)$/i, '').replace(/[_-]/g, ' ');
    return {
      id: `cand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      vacancyId: selectedVacancyId,
      fullName: parsed.fullName !== 'Новый кандидат' ? parsed.fullName : (cleanFileName || 'Новый кандидат'),
      contacts: {
        phone: parsed.phone,
        email: parsed.email,
        telegram: parsed.telegram,
        github: parsed.github
      },
      skills: parsed.detectedSkills,
      source: 'search',
      stage: 'screening',
      expectedSalary: parsed.expectedSalary,
      stageHistory: [{ stage: 'screening', enteredAt: new Date().toISOString().slice(0, 10) }],
      scores: {},
      rawResumeText: text
    };
  };

  const handleParseAndAddCandidate = async () => {
    if (!rawCvInput.trim()) return;
    const newCandidate = createCandidateFromText(rawCvInput);
    await db.candidates.put(newCandidate);
    setCandidates(prev => [newCandidate, ...prev]);
    setRawCvInput('');
    setUploadStatus(`Сохранено в IndexedDB: ${newCandidate.fullName}`);
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;

    setIsProcessingFile(true);
    setUploadStatus(null);
    const addedCandidates: Candidate[] = [];

    try {
      for (const file of fileArray) {
        const extractedText = await extractTextFromFile(file);
        const cand = createCandidateFromText(extractedText, file.name);
        addedCandidates.push(cand);
        if (fileArray.length === 1) {
          setRawCvInput(extractedText);
        }
      }
      await db.candidates.bulkPut(addedCandidates);
      setCandidates(prev => [...addedCandidates, ...prev]);
      setUploadStatus(
        addedCandidates.length === 1
          ? `В IndexedDB: ${addedCandidates[0].fullName} (${addedCandidates[0].skills.length} навыков)`
          : `Пакетно сохранено в IndexedDB: ${addedCandidates.length} резюме`
      );
    } catch (err: any) {
      alert(err?.message || 'Ошибка при чтении файла резюме');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const updateCandidateStage = async (candId: string, newStage: CandidateStage) => {
    const target = candidates.find(c => c.id === candId);
    if (!target || target.stage === newStage) return;
    let reason: string | undefined;
    if (newStage === 'rejected') {
      const input = window.prompt(
        `Укажите номер причины отказа:\n${REJECTION_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
        '1'
      );
      if (input === null) return;
      const idx = Number(input.trim()) - 1;
      if (!Number.isInteger(idx) || !REJECTION_REASONS[idx]) {
        alert('Укажите номер причины из списка.');
        return;
      }
      reason = REJECTION_REASONS[idx];
    }

    const updated = transitionCandidate(target, newStage, reason, new Date().toISOString().slice(0, 10));
    if (!updated) return;
    try {
      const saved = await db.candidates.update(candId, { stage: updated.stage, rejectionReason: updated.rejectionReason, stageHistory: updated.stageHistory });
      if (!saved) throw new Error('Candidate not found');
      setCandidates(prev => prev.map(c => c.id === candId ? { ...c, stage: updated.stage, rejectionReason: updated.rejectionReason, stageHistory: updated.stageHistory } : c));
    } catch {
      alert('Не удалось сохранить этап кандидата.');
    }
  };

  const handleKanbanDragStart = (e: React.DragEvent<HTMLDivElement>, candId: string) => {
    setDraggedCandId(candId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-hrtools-candidate', candId);
  };

  const handleKanbanDropOnStage = async (e: React.DragEvent<HTMLDivElement>, targetStage: CandidateStage) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('application/x-hrtools-candidate');
    setDraggedCandId(null);
    setDragOverStage(null);
    if (id && id === draggedCandId) await updateCandidateStage(id, targetStage);
  };

  const deleteCandidate = async (candId: string) => {
    await db.candidates.delete(candId);
    setCandidates(prev => prev.filter(c => c.id !== candId));
  };

  const runLocalAiAnalysis = async (cand: Candidate) => {
    const vac = vacancies.find(v => v.id === cand.vacancyId) || vacancies[0];
    if (!vac) return;
    setAiLoadingCandId(cand.id);
    try {
      const summary = await analyzeCandidateWithLocalLlm(cand, vac, {
        endpoint: llmEndpoint,
        model: llmModel
      });
      const updated: Candidate = { ...cand, aiSummary: summary };
      await db.candidates.put(updated);
      setCandidates(prev => prev.map(c => c.id === cand.id ? updated : c));
    } catch (err: any) {
      alert(
        `Не удалось подключиться к локальной LLM (${llmEndpoint}).\n` +
        `Убедитесь, что в LM Studio включен Local Server (порт 1234) с опцией CORS, либо запущена Ollama (порт 11434).\n\nДетали: ${err?.message || err}`
      );
    } finally {
      setAiLoadingCandId(null);
    }
  };

  const filteredCandidates = useMemo(() => {
    return filterCandidates(candidates, searchQuery, stageFilter, vacancyFilter);
  }, [candidates, searchQuery, stageFilter, vacancyFilter]);

  // --- Модуль 4: Скоркарта ---
  const [dossierId, setDossierId] = useState<string | null>(null);
  const dossierCandidate = candidates.find(c => c.id === dossierId);
  const [activeCandId, setActiveCandId] = useState<string>('');
  const activeCandidate = candidates.find(c => c.id === activeCandId) || candidates[0];
  const activeVacancy = vacancies.find(v => v.id === activeCandidate?.vacancyId) || vacancies[0];

  const openScorecardForCandidate = (candId: string) => { setActiveCandId(candId); setActiveTab('scorecard'); };

  const handleScoreChange = async (compId: string, score: number, note: string) => {
    if (!activeCandidate) return;
    const updated: Candidate = {
      ...activeCandidate,
      scores: { ...activeCandidate.scores, [compId]: { score, note } }
    };
    await db.candidates.put(updated);
    setCandidates(prev => prev.map(c => c.id === activeCandidate.id ? updated : c));
  };

  // --- Модуль 5: Сравнение кандидатов бок о бок (Side-by-Side v0.5.0) ---
  const compareVacancy = vacancies.find(v => v.id === compareVacancyId) || vacancies[0];
  const vacancyCandidatesPool = useMemo(
    () => candidates.filter(c => c.vacancyId === compareVacancy?.id),
    [candidates, compareVacancy]
  );

  const comparedCandidates = useMemo(
    () => vacancyCandidatesPool.filter(c => selectedCompareIds.includes(c.id)),
    [vacancyCandidatesPool, selectedCompareIds]
  );

  useEffect(() => {
    setSelectedCompareIds(ids => ids.filter(id => vacancyCandidatesPool.some(c => c.id === id)));
  }, [vacancyCandidatesPool]);

  const toggleCandidateInComparison = (candId: string) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(candId)) return prev.filter(id => id !== candId);
      if (prev.length >= 4) {
        alert('Для удобного чтения бок о бок можно выбрать максимум 4 кандидатов одновременно.');
        return prev;
      }
      return [...prev, candId];
    });
  };

  const handleCompareVacancyChange = (vacId: string) => {
    setCompareVacancyId(vacId);
    const poolIds = candidates.filter(c => c.vacancyId === vacId).slice(0, 3).map(c => c.id);
    setSelectedCompareIds(poolIds);
  };

  // --- Модуль 5: Графики воронки, отказов и ROI Калькулятор ---
  const [tcSalary, setTcSalary] = useState(190000);
  const [tcDays, setTcDays] = useState(42);
  const [tcOnboarding, setTcOnboarding] = useState(3);

  const turnoverResult = useMemo(() => calculateTurnoverCost({
    monthlySalary: tcSalary,
    daysToFill: tcDays,
    onboardingMonths: tcOnboarding,
    hrHoursSpent: 25,
    managerHoursSpent: 15,
    hourlyRateAvg: 1800,
    externalAdsCost: 15000
  }), [tcSalary, tcDays, tcOnboarding]);

  const funnelSteps = useMemo(
    () => calculateFunnelMetrics(candidates, STAGE_LABELS, analyticsVacancyFilter),
    [candidates, analyticsVacancyFilter]
  );

  const rejectionMetrics = useMemo(
    () => calculateRejectionBreakdown(candidates, analyticsVacancyFilter),
    [candidates, analyticsVacancyFilter]
  );

  // --- Экспорт / Импорт IndexedDB ---
  const exportDatabase = async () => {
    const [allVacancies, allCandidates] = await Promise.all([
      db.vacancies.toArray(),
      db.candidates.toArray()
    ]);
    const payload = JSON.stringify({
      engine: 'IndexedDB-Dexie-v0.6.0',
      exportedAt: new Date().toISOString(),
      vacancies: allVacancies,
      candidates: allCandidates
    }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hrtools-indexeddb-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const importDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBackup(text);
      if (!window.confirm(`Восстановить ${parsed.vacancies.length} вакансий и ${parsed.candidates.length} кандидатов? Текущая база будет заменена. Перед продолжением сохраните резервную копию текущих данных.`)) return;
      await restoreBackup(db, parsed);
      setVacancies(parsed.vacancies);
      setCandidates(parsed.candidates);
      setDossierId(null);
      setOfferDirty(false);
      setDatabaseRevision(revision => revision + 1);
      setUploadStatus(`База IndexedDB восстановлена (${parsed.candidates.length} кандидатов)`);
    } catch (error) {
      alert(`Не удалось восстановить резервную копию: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4">
        <div>
          <div className="mb-6 px-2">
            <h1 className="text-lg font-bold tracking-tight text-emerald-400">HRtools</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>v0.6.0 • IndexedDB ({candidates.length})</span>
            </div>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'ats', label: 'Мини-ATS и Парсер', icon: Users },
              { id: 'vacancies', label: 'Вакансии и Матрицы', icon: Briefcase },
              { id: 'scorecard', label: 'Скоркарта STAR', icon: ClipboardCheck },
              { id: 'compare', label: 'Сравнение кандидатов', icon: Columns },
              { id: 'analytics', label: 'Воронка и ROI', icon: BarChart3 },
              { id: 'boolean', label: 'Сорсинг и Boolean', icon: Search },
              { id: 'docs', label: 'Оффер и План 30-60-90', icon: FileText }
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (activeTab === 'docs' && item.id !== 'docs' && offerDirty && !window.confirm('Есть несохранённые изменения оффера. Перейти на другую вкладку?')) return;
                    if (item.id !== 'docs') setOfferDirty(false);
                    setActiveTab(item.id as any);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    activeTab === item.id 
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' 
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
              <Cpu className="w-3.5 h-3.5" /> Локальная LLM (Офлайн)
            </div>
            <div>
              <label className="text-[10px] text-slate-400">Endpoint (LM Studio / Ollama)</label>
              <input
                value={llmEndpoint}
                onChange={e => saveLlmSettings(e.target.value, llmModel)}
                className="w-full mt-0.5 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-[11px]"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => saveLlmSettings('http://localhost:1234/v1/chat/completions', 'local-model')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
              >
                LM Studio :1234
              </button>
              <button
                onClick={() => saveLlmSettings('http://localhost:11434/v1/chat/completions', 'qwen2.5:7b')}
                className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 rounded text-[10px] text-slate-300"
              >
                Ollama :11434
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-2">
          <button
            onClick={() => exportCandidatesToCsv(candidates, vacancies, STAGE_LABELS)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 rounded text-xs font-medium text-emerald-300"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Выгрузить базу в CSV
          </button>
          <button
            onClick={exportDatabase}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Экспорт IndexedDB
          </button>
          <input
            ref={backupInputRef}
            type="file"
            accept=".json"
            onChange={importDatabase}
            className="hidden"
          />
          <button
            onClick={() => backupInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-xs font-medium text-slate-400"
          >
            <Upload className="w-3.5 h-3.5" /> Импорт базы (JSON)
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {!dbReady && (
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Инициализация транзакционной базы IndexedDB...
          </div>
        )}

        {/* ВКЛАДКА: СРАВНЕНИЕ КАНДИДАТОВ БОК О БОК (SIDE-BY-SIDE v0.5.0) */}
        {dbReady && activeTab === 'compare' && compareVacancy && (
          <div className="space-y-6">
            <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div>
                <h2 className="text-lg font-semibold">Сравнение финальных кандидатов (Side-by-Side Matrix)</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Сопоставление оценок по компетенциям, весов, Compa-Ratio и выводов ИИ на одном экране
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={compareVacancy.id}
                  onChange={e => handleCompareVacancyChange(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium"
                >
                  {vacancies.map(v => (
                    <option key={v.id} value={v.id}>Вакансия: {v.title}</option>
                  ))}
                </select>
                <button
                  onClick={() => exportComparisonMatrixToCsv(compareVacancy, comparedCandidates, STAGE_LABELS)}
                  disabled={comparedCandidates.length === 0}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Экспорт матрицы в CSV
                </button>
              </div>
            </div>

            {/* Выбор кандидатов для сравнения (чекбоксы-чипы) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs text-slate-400">
                Выберите до 4 кандидатов по вакансии «{compareVacancy.title}» для сопоставления:
              </div>
              <div className="flex flex-wrap gap-2">
                {vacancyCandidatesPool.map(c => {
                  const isSelected = selectedCompareIds.includes(c.id);
                  const wScore = calculateWeightedScore(compareVacancy.competencies, c.scores);
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleCandidateInComparison(c.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-2 ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span>{c.fullName}</span>
                      <span className="px-1.5 py-0.5 bg-slate-900 rounded text-[10px]">
                        {wScore > 0 ? `${wScore} ★` : STAGE_LABELS[c.stage]}
                      </span>
                    </button>
                  );
                })}
                {vacancyCandidatesPool.length === 0 && (
                  <span className="text-xs text-slate-500">На этой вакансии пока нет кандидатов.</span>
                )}
              </div>
            </div>

            {/* Таблица Side-by-Side */}
            {comparedCandidates.length > 0 && (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950 border-b border-slate-800">
                      <th className="p-3.5 w-64 text-slate-400 font-medium">Критерий / Компетенция</th>
                      {comparedCandidates.map(cand => {
                        return (
                          <th key={cand.id} className="p-3.5 border-l border-slate-800 min-w-[230px]">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-bold text-slate-100">{cand.fullName}</span>

                            </div>
                            <div className="text-[11px] text-slate-400 font-normal mt-0.5">
                              {STAGE_LABELS[cand.stage]} • {getDaysInCurrentStage(cand)} дн. на этапе
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {/* Строка: Итоговый средневзвешенный балл */}
                    <tr className="bg-slate-950/60">
                      <td className="p-3 font-semibold text-emerald-400">Средневзвешенный балл (STAR)</td>
                      {comparedCandidates.map(cand => {
                        const score = calculateWeightedScore(compareVacancy.competencies, cand.scores);
                        return (
                          <td key={cand.id} className="p-3 border-l border-slate-800">
                            <span className="text-base font-bold text-emerald-400">
                              {score > 0 ? `${score} / 5.0 (${compareVacancy.competencies.filter(comp => cand.scores[comp.id]?.score > 0).length}/${compareVacancy.competencies.length} оценено)` : 'Не оценен'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Строка: Зарплатные ожидания и Compa-Ratio */}
                    <tr>
                      <td className="p-3">
                        <div className="font-medium text-slate-200">Ожидания по ЗП и Compa-Ratio</div>
                        <div className="text-[11px] text-slate-500">
                          Вилка: {compareVacancy.salaryMin.toLocaleString('ru-RU')} – {compareVacancy.salaryMax.toLocaleString('ru-RU')} ₽
                        </div>
                      </td>
                      {comparedCandidates.map(cand => {
                        const cr = cand.expectedSalary
                          ? calculateCompaRatio(cand.expectedSalary, compareVacancy.salaryMin, compareVacancy.salaryMax)
                          : null;
                        return (
                          <td key={cand.id} className="p-3 border-l border-slate-800">
                            {cand.expectedSalary ? (
                              <div>
                                <div className="font-semibold text-slate-100">
                                  {cand.expectedSalary.toLocaleString('ru-RU')} ₽
                                </div>
                                {cr && (
                                  <div className={`text-[11px] mt-0.5 ${cr.ratio > 115 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    CR: {cr.ratio}% • {cr.zone}
                                  </div>
                                )}
                              </div>
                            ) : 'Не указано'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Строки по каждой компетенции матрицы */}
                    {compareVacancy.competencies.map(comp => (
                      <tr key={comp.id} className="hover:bg-slate-800/30">
                        <td className="p-3">
                          <div className="font-medium text-slate-200">{comp.name}</div>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="px-1.5 py-0.5 bg-slate-800 text-emerald-300 rounded text-[10px]">
                              Вес x{comp.weight}
                            </span>
                            <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] uppercase">
                              {comp.category}
                            </span>
                          </div>
                        </td>
                        {comparedCandidates.map(cand => {
                          const entry = cand.scores[comp.id];
                          return (
                            <td key={cand.id} className="p-3 border-l border-slate-800 align-top">
                              {entry && entry.score > 0 ? (
                                <div>
                                  <div className="inline-block px-2 py-0.5 rounded font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    {entry.score} / 5
                                  </div>
                                  {entry.note && (
                                    <p className="text-[11px] text-slate-300 mt-1.5 italic">«{entry.note}»</p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-500">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Строка: Технологический стек */}
                    <tr>
                      <td className="p-3 font-medium text-slate-300">Распознанный стек</td>
                      {comparedCandidates.map(cand => (
                        <td key={cand.id} className="p-3 border-l border-slate-800">
                          <div className="flex flex-wrap gap-1">
                            {cand.skills.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-slate-800 rounded text-[10px]">{s}</span>
                            ))}
                          </div>
                        </td>
                      ))}
                    </tr>

                    {/* Строка: Вывод локальной LLM */}
                    <tr>
                      <td className="p-3 font-medium text-slate-300">AI-заключение (LM Studio / Ollama)</td>
                      {comparedCandidates.map(cand => (
                        <td key={cand.id} className="p-3 border-l border-slate-800 align-top">
                          {cand.aiSummary ? (
                            <div className="text-[11px] text-slate-300 whitespace-pre-wrap">{cand.aiSummary}</div>
                          ) : (
                            <span className="text-slate-500 text-[11px]">Нет AI-разбора</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ВКЛАДКА: КОНСТРУКТОР ВАКАНСИЙ И МАТРИЦ КОМПЕТЕНЦИЙ (v0.4.0) */}
        {dbReady && activeTab === 'vacancies' && (
          <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Конструктор вакансий и матриц компетенций</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Настройте зарплатные вилки для расчета Compa-Ratio и весовые критерии для скоркарт STAR
                </p>
              </div>
              <button
                onClick={handleCreateVacancy}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3.5 py-2 rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" /> Создать вакансию
              </button>
            </div>

            {currentEditingVacancy && <>
            <div className="flex gap-2 flex-wrap">
              {vacancies.map(v => (
                <button
                  key={v.id}
                  onClick={() => setEditingVacancyId(v.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${
                    v.id === currentEditingVacancy.id
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.title} ({v.competencies.length} комп.)
                </button>
              ))}
            </div>

            <div className="grid grid-cols-4 gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div className="col-span-2">
                <label className="text-xs text-slate-400">Название должности</label>
                <input
                  value={currentEditingVacancy.title}
                  onChange={e => handleUpdateVacancyField({ title: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm font-medium"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-slate-400">Департамент / Цех / Отдел</label>
                <input
                  value={currentEditingVacancy.department}
                  onChange={e => handleUpdateVacancyField({ department: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Мин. вилка грейда (₽)</label>
                <input
                  type="number"
                  value={currentEditingVacancy.salaryMin}
                  onChange={e => handleUpdateVacancyField({ salaryMin: Number(e.target.value) })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Макс. вилка грейда (₽)</label>
                <input
                  type="number"
                  value={currentEditingVacancy.salaryMax}
                  onChange={e => handleUpdateVacancyField({ salaryMax: Number(e.target.value) })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Медиана грейда (100% CR)</label>
                <div className="mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm text-emerald-400 font-semibold">
                  {Math.round((currentEditingVacancy.salaryMin + currentEditingVacancy.salaryMax) / 2).toLocaleString('ru-RU')} ₽
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400">Дата открытия заявки</label>
                <input
                  type="date"
                  value={currentEditingVacancy.openedAt}
                  onChange={e => handleUpdateVacancyField({ openedAt: e.target.value })}
                  className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm"
                />
              </div>
            </div>

            {/* Список компетенций вакансии */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
              <h3 className="text-sm font-semibold text-emerald-400">
                Матрица оценки для интервью ({currentEditingVacancy.competencies.length})
              </h3>

              <div className="space-y-2">
                {currentEditingVacancy.competencies.map(comp => (
                  <div
                    key={comp.id}
                    className="flex items-start justify-between gap-4 bg-slate-950 border border-slate-800 rounded-lg p-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100">{comp.name}</span>
                        <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded text-[10px]">
                          Вес x{comp.weight}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-800 text-slate-400 rounded text-[10px] uppercase">
                          {comp.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 italic">STAR: {comp.starPrompt}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveCompetency(comp.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Удалить компетенцию"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Форма добавления новой компетенции */}
              <div className="border-t border-slate-800 pt-4 grid grid-cols-12 gap-3">
                <div className="col-span-5">
                  <label className="text-[11px] text-slate-400">Название компетенции / навыка</label>
                  <input
                    value={newCompName}
                    onChange={e => setNewCompName(e.target.value)}
                    placeholder="Напр.: Проектирование контуров ПАЗ / Архитектура БД"
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-slate-400">Вес (1–3)</label>
                  <select
                    value={newCompWeight}
                    onChange={e => setNewCompWeight(Number(e.target.value) as 1 | 2 | 3)}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                  >
                    <option value={1}>x1 (Базовый)</option>
                    <option value={2}>x2 (Важный)</option>
                    <option value={3}>x3 (Критический)</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] text-slate-400">Тип</label>
                  <select
                    value={newCompCategory}
                    onChange={e => setNewCompCategory(e.target.value as 'hard' | 'soft')}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                  >
                    <option value="hard">Hard Skill</option>
                    <option value="soft">Soft Skill</option>
                  </select>
                </div>
                <div className="col-span-3 flex items-end">
                  <button
                    onClick={handleAddCompetency}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2 px-3 rounded flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Добавить в матрицу
                  </button>
                </div>
                <div className="col-span-12">
                  <input
                    value={newCompPrompt}
                    onChange={e => setNewCompPrompt(e.target.value)}
                    placeholder="Поведенческий вопрос по методу STAR (что именно спросить на собеседовании для проверки навыка)..."
                    className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                  />
                </div>
              </div>
            </div>
            </>}
          </div>
        )}

        {dbReady && activeTab === 'boolean' && (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Генератор Boolean и X-Ray запросов</h2>
              <div className="flex gap-2">
                {BOOLEAN_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-emerald-600/20 hover:text-emerald-300 border border-slate-700 rounded"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="text-xs text-slate-400">Должности (через запятую → OR)</label>
                <input value={bTitles} onChange={e => setBTitles(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Обязательный стек (через запятую → AND)</label>
                <input value={bMust} onChange={e => setBMust(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Синонимы и смежные технологии (OR)</label>
                <input value={bAlt} onChange={e => setBAlt(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400">Исключить слова (NOT)</label>
                <input value={bNot} onChange={e => setBNot(e.target.value)} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Универсальный Boolean (HH / Внутренние базы)', val: booleanQueries.universal },
                { label: 'Google X-Ray: Habr Career', val: booleanQueries.habrXray },
                { label: 'Google X-Ray: GitHub профили', val: booleanQueries.githubXray },
                { label: 'Прямой поиск PDF-резюме в сети', val: booleanQueries.pdfResumes }
              ].map((q, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-emerald-400">{q.label}</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(q.val)}
                      className="text-xs flex items-center gap-1 text-slate-400 hover:text-white"
                    >
                      <Copy className="w-3 h-3" /> Копировать
                    </button>
                  </div>
                  <code className="text-xs text-slate-200 break-all">{q.val}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {dbReady && activeTab === 'ats' && (
          <div className="space-y-6">
            <div className="grid grid-cols-12 gap-4">
              <div
                onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`col-span-5 border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                  isDragging 
                    ? 'border-emerald-400 bg-emerald-500/10' 
                    : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  multiple
                  onChange={e => e.target.files && processFiles(e.target.files)}
                  className="hidden"
                />
                {isProcessingFile ? (
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-2" />
                ) : (
                  <FileUp className="w-8 h-8 text-emerald-400 mb-2" />
                )}
                <div className="text-xs font-semibold text-slate-200">
                  Перетащите PDF, DOCX или TXT резюме сюда
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Прямая запись в IndexedDB (без лимита 5 МБ)
                </p>
                {uploadStatus && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {uploadStatus}
                  </div>
                )}
              </div>

              <div className="col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-emerald-400">
                    Или вставьте скопированный текст резюме
                  </h3>
                  <select
                    value={selectedVacancyId}
                    onChange={e => setSelectedVacancyId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs"
                  >
                    {vacancies.map(v => <option key={v.id} value={v.id}>Вакансия: {v.title}</option>)}
                  </select>
                </div>
                <textarea
                  value={rawCvInput}
                  onChange={e => setRawCvInput(e.target.value)}
                  placeholder="ФИО, телефон, email, @telegram, желаемая ЗП и стек сохраняются в IndexedDB..."
                  className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs h-20 mb-2"
                />
                <button
                  onClick={handleParseAndAddCandidate}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2 px-4 rounded flex items-center justify-center gap-1.5 self-end"
                >
                  <Plus className="w-4 h-4" /> Сохранить в IndexedDB
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 bg-slate-900 p-3 rounded-xl border border-slate-800">
              <button type="button" onClick={() => setAtsViewMode('kanban')} aria-pressed={atsViewMode === 'kanban'} className="px-3 py-1 rounded bg-slate-800 text-xs">Канбан</button>
              <button type="button" onClick={() => setAtsViewMode('table')} aria-pressed={atsViewMode === 'table'} className="px-3 py-1 rounded bg-slate-800 text-xs">Таблица</button>
              <select aria-label="Фильтр по вакансии" value={vacancyFilter} onChange={e => setVacancyFilter(e.target.value)} className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs">
                <option value="all">Все вакансии</option>
                {vacancies.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Полнотекстовый поиск по IndexedDB (имя, стек CODESYS / Python, слова внутри PDF резюме)..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs"
              />
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs"
              >
                <option value="all">Все этапы ({candidates.length})</option>
                {Object.entries(STAGE_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>{label}</option>
                ))}
              </select>
              <button onClick={() => exportCandidatesToCsv(filteredCandidates, vacancies, STAGE_LABELS)} className="px-3 py-1.5 bg-slate-800 text-emerald-300 rounded text-xs shrink-0">CSV ({filteredCandidates.length})</button>
            </div>

            {atsViewMode === 'kanban' && (
              <div className="flex gap-3 overflow-x-auto pb-4">
                {(Object.keys(STAGE_LABELS) as CandidateStage[]).map(stageKey => {
                  const stageCandidates = filteredCandidates.filter(c => c.stage === stageKey);
                  const isDragTarget = dragOverStage === stageKey;

                  return (
                    <div
                      key={stageKey}
                      onDragOver={e => {
                        if (!draggedCandId) return;
                        e.preventDefault();
                        if (dragOverStage !== stageKey) setDragOverStage(stageKey);
                      }}
                      onDragLeave={() => setDragOverStage(null)}
                      onDrop={e => handleKanbanDropOnStage(e, stageKey)}
                      className={`w-72 shrink-0 rounded-xl border p-3 flex flex-col justify-between transition ${
                        isDragTarget
                          ? 'bg-emerald-950/30 border-emerald-400'
                          : 'bg-slate-900/90 border-slate-800'
                      }`}
                    >
                      <div>
                        {/* Шапка колонки */}
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                          <span className={`text-xs font-bold ${
                            stageKey === 'rejected'
                              ? 'text-rose-400'
                              : stageKey === 'hired'
                              ? 'text-emerald-400'
                              : 'text-slate-200'
                          }`}>
                            {STAGE_LABELS[stageKey]}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded-full text-[11px] font-semibold text-slate-300">
                            {stageCandidates.length}
                          </span>
                        </div>

                        {/* Список перетаскиваемых карточек */}
                        <div className="space-y-2.5 min-h-[420px]">
                          {stageCandidates.map(cand => {
                            const vac = vacancies.find(v => v.id === cand.vacancyId);
                            const days = getDaysInCurrentStage(cand);
                            const wScore = vac ? calculateWeightedScore(vac.competencies, cand.scores) : 0;
                            const compa = cand.expectedSalary && vac
                              ? calculateCompaRatio(cand.expectedSalary, vac.salaryMin, vac.salaryMax)
                              : null;

                            return (
                              <div
                                key={cand.id}
                                draggable
                                onDragStart={e => handleKanbanDragStart(e, cand.id)}
                                onDragEnd={() => {
                                  setDraggedCandId(null);
                                  setDragOverStage(null);
                                }}
                                className={`bg-slate-950 border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:border-slate-600 transition space-y-2 ${
                                  draggedCandId === cand.id
                                    ? 'opacity-40 border-emerald-400'
                                    : 'border-slate-800'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-xs font-bold text-slate-100 leading-snug">
                                      <button type="button" onClick={() => setDossierId(cand.id)} className="text-left underline">{cand.fullName}</button>
                                    </div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                      {vac?.title || 'Вакансия'}
                                    </div>
                                  </div>
                                  <GripVertical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                                </div>

                                {/* Бейджи метрик: Балл STAR, Compa-Ratio и Дни на этапе */}
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {wScore > 0 && (
                                    <span className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 rounded text-[10px] font-semibold">
                                      ★ {wScore}
                                    </span>
                                  )}
                                  {cand.expectedSalary && (
                                    <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-[10px] text-slate-200">
                                      {cand.expectedSalary.toLocaleString('ru-RU')} ₽
                                      {compa ? ` (${compa.ratio}%)` : ''}
                                    </span>
                                  )}
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                    days > 7
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                      : 'bg-slate-900 text-slate-400'
                                  }`}>
                                    {days} дн.
                                  </span>
                                </div>

                                {/* Навыки */}
                                {cand.skills.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {cand.skills.slice(0, 5).map(skill => (
                                      <span key={skill} className="px-1.5 py-0.5 bg-slate-900 text-slate-300 rounded text-[10px]">
                                        {skill}
                                      </span>
                                    ))}
                                    {cand.skills.length > 5 && (
                                      <span className="text-[10px] text-slate-500">+{cand.skills.length - 5}</span>
                                    )}
                                  </div>
                                )}

                                {/* Контакты */}
                                <div className="text-[10px] text-slate-400 flex flex-wrap gap-2">
                                  {cand.contacts.telegram && (
                                    <span className="text-emerald-400">{cand.contacts.telegram}</span>
                                  )}
                                  {cand.contacts.phone && <span>{cand.contacts.phone}</span>}
                                </div>

                                {/* Причина отказа (если в отказе) */}
                                {cand.rejectionReason && (
                                  <div className="text-[10px] text-rose-400 bg-rose-950/30 border border-rose-500/20 rounded p-1.5">
                                    {cand.rejectionReason}
                                  </div>
                                )}

                                <label className="block text-[10px] text-slate-400">Этап кандидата
                                  <select aria-label={`Этап: ${cand.fullName}`} value={cand.stage} onChange={e => updateCandidateStage(cand.id, e.target.value as CandidateStage)} className="block w-full bg-slate-900 border border-slate-700 rounded p-1 text-xs">
                                    {Object.entries(STAGE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                                  </select>
                                </label>

                                {/* Быстрые действия на карточке */}
                                <div className="pt-1.5 border-t border-slate-900 flex items-center justify-between">
                                  <button
                                    onClick={() => openScorecardForCandidate(cand.id)}
                                    className="text-[10px] text-slate-300 hover:text-emerald-300 flex items-center gap-1"
                                  >
                                    <ClipboardCheck className="w-3 h-3" /> Скоркарта
                                  </button>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => runLocalAiAnalysis(cand)}
                                      disabled={aiLoadingCandId === cand.id}
                                      className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                                      title="Запустить локальный AI-разбор"
                                    >
                                      {aiLoadingCandId === cand.id ? (
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="w-3 h-3" />
                                      )}
                                      AI
                                    </button>

                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {atsViewMode === 'table' && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Кандидат и контакты</th>
                    <th className="p-3">Распознанный стек и AI-ревью</th>
                    <th className="p-3">Ожидания (Compa-Ratio)</th>
                    <th className="p-3">Текущий этап</th>
                    <th className="p-3">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredCandidates.map(cand => {
                    const vac = vacancies.find(v => v.id === cand.vacancyId);
                    const days = getDaysInCurrentStage(cand);
                    const compa = cand.expectedSalary && vac 
                      ? calculateCompaRatio(cand.expectedSalary, vac.salaryMin, vac.salaryMax) 
                      : null;

                    return (
                      <tr key={cand.id} className="hover:bg-slate-800/40 align-top">
                        <td className="p-3">
                          <button type="button" onClick={() => setDossierId(cand.id)} className="font-semibold text-slate-100 underline text-left">{cand.fullName}</button>
                          <div className="text-[11px] text-slate-500">{vac?.title}</div>
                          <div className="text-slate-400 space-x-2 mt-0.5">
                            {cand.contacts.phone && <span>{cand.contacts.phone}</span>}
                            {cand.contacts.email && <span>{cand.contacts.email}</span>}
                            {cand.contacts.telegram && <span className="text-emerald-400">{cand.contacts.telegram}</span>}
                          </div>
                          <div className="mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${days > 7 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-400'}`}>
                              На этапе: {days} дн.
                            </span>
                          </div>
                        </td>
                        <td className="p-3 max-w-md">
                          <div className="flex flex-wrap gap-1">
                            {cand.skills.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-slate-800 rounded text-[11px]">{s}</span>
                            ))}
                          </div>
                          {cand.aiSummary && (
                            <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-500/30 rounded text-[11px] text-slate-200 whitespace-pre-wrap">
                              {cand.aiSummary}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          {cand.expectedSalary ? (
                            <div>
                              <span className="font-medium">{cand.expectedSalary.toLocaleString('ru-RU')} ₽</span>
                              {compa && <div className="text-[11px] text-slate-400">CR: {compa.ratio}%</div>}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="p-3">
                          <select
                            value={cand.stage}
                            onChange={e => updateCandidateStage(cand.id, e.target.value as CandidateStage)}
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs"
                          >
                            {Object.entries(STAGE_LABELS).map(([k, label]) => (
                              <option key={k} value={k}>{label}</option>
                            ))}
                          </select>
                          {cand.rejectionReason && (
                            <div className="text-[11px] text-rose-400 mt-1">{cand.rejectionReason}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => runLocalAiAnalysis(cand)}
                              disabled={aiLoadingCandId === cand.id}
                              title="Проанализировать через локальную LLM (LM Studio / Ollama)"
                              className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded text-[11px] flex items-center gap-1"
                            >
                              {aiLoadingCandId === cand.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Sparkles className="w-3 h-3" />
                              )}
                              AI-разбор
                            </button>
                            <button
                              onClick={() => deleteCandidate(cand.id)}
                              title="Удалить из IndexedDB"
                              className="p-1 text-slate-500 hover:text-rose-400"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {dbReady && activeTab === 'scorecard' && activeCandidate && activeVacancy && (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="text-xs text-slate-400 block">Оцениваемый кандидат ({activeVacancy.title}):</label>
                <select
                  value={activeCandidate.id}
                  onChange={e => setActiveCandId(e.target.value)}
                  className="mt-1 bg-slate-950 border border-slate-700 rounded p-2 text-sm font-medium"
                >
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
                </select>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Средневзвешенный балл:</span>
                <div className="text-2xl font-bold text-emerald-400">
                  {calculateWeightedScore(activeVacancy.competencies, activeCandidate.scores)} / 5.0
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {activeVacancy.competencies.map(comp => {
                const current = activeCandidate.scores[comp.id] || { score: 0, note: '' };
                return (
                  <div key={comp.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-sm font-semibold">{comp.name}</span>
                        <span className="ml-2 text-xs px-2 py-0.5 bg-slate-800 rounded text-slate-300">
                          Вес: x{comp.weight}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button
                            key={n}
                            onClick={() => handleScoreChange(comp.id, n, current.note)}
                            className={`w-8 h-8 rounded font-bold text-xs ${
                              current.score === n 
                                ? 'bg-emerald-500 text-slate-950' 
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 italic">STAR-вопрос: {comp.starPrompt}</p>
                    <input
                      value={current.note}
                      onChange={e => handleScoreChange(comp.id, current.score, e.target.value)}
                      placeholder="Заметки интервьюера (сохраняются в IndexedDB мгновенно)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ВКЛАДКА: ВИЗУАЛЬНЫЕ ГРАФИКИ ВОРОНКИ, ОТКАЗОВ И КАЛЬКУЛЯТОР ROI (v0.4.0) */}
        {dbReady && activeTab === 'analytics' && (
          <div className="max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Дашборд воронки рекрутинга и аналитика отказов</h2>
              <button onClick={() => exportAnalyticsToCsv(funnelSteps, rejectionMetrics, analyticsVacancyFilter === 'all' ? 'Все вакансии' : (vacancies.find(v => v.id === analyticsVacancyFilter)?.title || 'Вакансия'))} className="px-3 py-2 bg-emerald-600 text-white rounded text-xs">Скачать CSV</button>
              <select
                value={analyticsVacancyFilter}
                onChange={e => setAnalyticsVacancyFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs"
              >
                <option value="all">Все вакансии ({candidates.length} канд.)</option>
                {vacancies.map(v => (
                  <option key={v.id} value={v.id}>{v.title}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-12 gap-6">
              {/* Горизонтальная воронка конверсии по этапам */}
              <div className="col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-400">
                  Этапы подбора и переходы между этапами
                </h3>
                <p className="text-xs text-slate-400">Учитываются записанные этапы. Переход — доля достигших предыдущего этапа, которые также побывали на текущем.</p>
                <div className="space-y-3">
                  {funnelSteps.map((step, i) => (
                    <div key={step.stage} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-slate-200">
                          {step.label}{' '}
                          <span className="text-slate-500">
                            (сейчас на этапе: {step.currentCount})
                          </span>
                        </span>
                        <span className="text-slate-300">
                          <strong className="text-emerald-400">{step.reachedCount}</strong> чел. ({step.conversionFromTop}% от входа
                          {i > 0 ? ` • ${step.conversionFromPrev}% из пред.` : ''})
                        </span>
                      </div>
                      <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 transition-all duration-300"
                          style={{ width: `${Math.max(step.conversionFromTop, step.reachedCount > 0 ? 6 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Парето-диаграмма причин отказов */}
              <div className="col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-rose-400">
                  Структура причин отказов
                </h3>
                {rejectionMetrics.length === 0 ? (
                  <p className="text-xs text-slate-500">По выбранному фильтру пока нет кандидатов в статусе «Отказ».</p>
                ) : (
                  <div className="space-y-3">
                    {rejectionMetrics.map(item => (
                      <div key={item.reason} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 truncate pr-2">{item.reason}</span>
                          <span className="text-rose-400 font-semibold shrink-0">
                            {item.count} ({item.sharePercent}%)
                          </span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="h-full bg-rose-500/80"
                            style={{ width: `${item.sharePercent}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Калькулятор стоимости замены сотрудника */}
            <div className="pt-2 space-y-4">
              <h3 className="text-lg font-semibold">Калькулятор стоимости замены сотрудника (Turnover Cost)</h3>
              <div className="grid grid-cols-3 gap-4 bg-slate-900 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="text-xs text-slate-400">Оклад специалиста (₽/мес)</label>
                  <input type="number" value={tcSalary} onChange={e => setTcSalary(Number(e.target.value))} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Срок закрытия вакансии (Time to Fill, дней)</label>
                  <input type="number" value={tcDays} onChange={e => setTcDays(Number(e.target.value))} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400">Срок выхода на 100% KPI (месяцев)</label>
                  <input type="number" value={tcOnboarding} onChange={e => setTcOnboarding(Number(e.target.value))} className="w-full mt-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <div className="text-xs text-slate-400">Потери от простоя</div>
                  <div className="text-lg font-bold mt-1">{turnoverResult.vacancyLoss.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <div className="text-xs text-slate-400">Потери на адаптации</div>
                  <div className="text-lg font-bold mt-1">{turnoverResult.rampUpLoss.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
                  <div className="text-xs text-slate-400">Затраты на подбор</div>
                  <div className="text-lg font-bold mt-1">{turnoverResult.hiringCost.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="bg-emerald-950/40 border border-emerald-500/40 p-4 rounded-xl">
                  <div className="text-xs text-emerald-300">Итого стоимость потери</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1">
                    {turnoverResult.totalCost.toLocaleString('ru-RU')} ₽ ({turnoverResult.salaryMultiplier} оклада)
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {dbReady && activeTab === 'docs' && activeCandidate && (
          vacancies.find(v => v.id === activeCandidate.vacancyId) ? (
            <OfferEditor key={`${databaseRevision}:${activeCandidate.id}`} candidate={activeCandidate} vacancy={vacancies.find(v => v.id === activeCandidate.vacancyId)!} candidates={candidates} onSelect={setActiveCandId} onDirtyChange={setOfferDirty}
              onSave={async draft => {
                const saved = await db.candidates.update(activeCandidate.id, { offerDraft: draft });
                if (!saved) throw new Error('Candidate not found');
                setCandidates(prev => prev.map(c => c.id === activeCandidate.id ? { ...c, offerDraft: draft } : c));
              }} />
          ) : <p>Вакансия кандидата не найдена. Проверьте данные кандидата.</p>
        )}
        {dossierCandidate && <CandidateDossier key={dossierCandidate.id} candidate={dossierCandidate} vacancy={vacancies.find(v => v.id === dossierCandidate.vacancyId)} labels={STAGE_LABELS} onClose={() => setDossierId(null)}
          onSave={async (contacts, expectedSalary) => {
            const saved = await db.candidates.update(dossierCandidate.id, { contacts, expectedSalary });
            if (!saved) throw new Error('Candidate not found');
            setCandidates(prev => prev.map(c => c.id === dossierCandidate.id ? { ...c, contacts, expectedSalary } : c));
          }} />}

      </main>
    </div>
  );
}
