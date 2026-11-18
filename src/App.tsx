import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, Users, ClipboardCheck, BarChart3, FileText, 
  Download, Copy, Plus 
} from 'lucide-react';
import { Vacancy, Candidate, CandidateStage } from './db/schema';
import { BOOLEAN_PRESETS, INITIAL_VACANCIES, INITIAL_CANDIDATES, REJECTION_REASONS } from './db/seed';
import { parseRawResumeText } from './utils/cvParser';
import { 
  getDaysInCurrentStage, 
  calculateWeightedScore, 
  calculateCompaRatio, 
  calculateTurnoverCost 
} from './utils/metricsMath';

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
  const [activeTab, setActiveTab] = useState<'boolean' | 'ats' | 'scorecard' | 'analytics' | 'docs'>('boolean');

  const [vacancies, setVacancies] = useState<Vacancy[]>(() => {
    const saved = localStorage.getItem('hr_toolkit_vacancies');
    return saved ? JSON.parse(saved) : INITIAL_VACANCIES;
  });

  const [candidates, setCandidates] = useState<Candidate[]>(() => {
    const saved = localStorage.getItem('hr_toolkit_candidates');
    return saved ? JSON.parse(saved) : INITIAL_CANDIDATES;
  });

  useEffect(() => {
    localStorage.setItem('hr_toolkit_vacancies', JSON.stringify(vacancies));
  }, [vacancies]);

  useEffect(() => {
    localStorage.setItem('hr_toolkit_candidates', JSON.stringify(candidates));
  }, [candidates]);

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

  const [rawCvInput, setRawCvInput] = useState('');
  const [selectedVacancyId, setSelectedVacancyId] = useState(vacancies[0]?.id || 'vac-1');

  const handleParseAndAddCandidate = () => {
    if (!rawCvInput.trim()) return;
    const parsed = parseRawResumeText(rawCvInput);
    const newCandidate: Candidate = {
      id: `cand-${Date.now()}`,
      vacancyId: selectedVacancyId,
      fullName: parsed.fullName,
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
      rawResumeText: rawCvInput
    };
    setCandidates(prev => [newCandidate, ...prev]);
    setRawCvInput('');
  };

  const updateCandidateStage = (candId: string, newStage: CandidateStage) => {
    let reason: string | undefined;
    if (newStage === 'rejected') {
      const input = window.prompt(
        `Укажите номер причины отказа:\n${REJECTION_REASONS.map((r, i) => `${i + 1}. ${r}`).join('\n')}`,
        '1'
      ) || '1';
      const idx = parseInt(input, 10) - 1;
      reason = REJECTION_REASONS[idx] || REJECTION_REASONS[0];
    }

    setCandidates(prev => prev.map(c => {
      if (c.id !== candId) return c;
      return {
        ...c,
        stage: newStage,
        rejectionReason: newStage === 'rejected' ? reason : c.rejectionReason,
        stageHistory: [...c.stageHistory, { stage: newStage, enteredAt: new Date().toISOString().slice(0, 10) }]
      };
    }));
  };

  const [activeCandId, setActiveCandId] = useState<string>(candidates[0]?.id || '');
  const activeCandidate = candidates.find(c => c.id === activeCandId) || candidates[0];
  const activeVacancy = vacancies.find(v => v.id === activeCandidate?.vacancyId) || vacancies[0];

  const handleScoreChange = (compId: string, score: number, note: string) => {
    if (!activeCandidate) return;
    setCandidates(prev => prev.map(c => {
      if (c.id !== activeCandidate.id) return c;
      return {
        ...c,
        scores: { ...c.scores, [compId]: { score, note } }
      };
    }));
  };

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

  const exportDatabase = () => {
    const payload = JSON.stringify({ vacancies, candidates, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hrtools-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans">
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4">
        <div>
          <div className="mb-6 px-2">
            <h1 className="text-lg font-bold tracking-tight text-emerald-400">HRtools</h1>
            <p className="text-xs text-slate-400">v0.1.0 • Local-First Edition</p>
          </div>
          <nav className="space-y-1">
            {[
              { id: 'boolean', label: 'Сорсинг и Boolean', icon: Search },
              { id: 'ats', label: 'Мини-ATS и Парсер', icon: Users },
              { id: 'scorecard', label: 'Скоркарта STAR', icon: ClipboardCheck },
              { id: 'analytics', label: 'Аналитика и ROI', icon: BarChart3 },
              { id: 'docs', label: 'Оффер и План 30-60-90', icon: FileText }
            ].map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
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
        </div>

        <div className="border-t border-slate-800 pt-4 space-y-2">
          <button
            onClick={exportDatabase}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-medium text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> Экспорт БД (JSON)
          </button>
        </div>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {activeTab === 'boolean' && (
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

        {activeTab === 'ats' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2 text-emerald-400">Быстрый офлайн-парсер резюме (Regex Extractor)</h3>
              <div className="flex gap-3">
                <textarea
                  value={rawCvInput}
                  onChange={e => setRawCvInput(e.target.value)}
                  placeholder="Вставьте скопированный текст резюме: ФИО, телефон, email, @telegram, желаемая ЗП и ключевые технологии распознаются автоматически..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded p-2.5 text-xs h-20"
                />
                <div className="w-64 flex flex-col justify-between">
                  <select
                    value={selectedVacancyId}
                    onChange={e => setSelectedVacancyId(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                  >
                    {vacancies.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                  </select>
                  <button
                    onClick={handleParseAndAddCandidate}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs py-2.5 px-4 rounded flex items-center justify-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> Распознать и в воронку
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Кандидат и контакты</th>
                    <th className="p-3">Распознанный стек</th>
                    <th className="p-3">Ожидания (Compa-Ratio)</th>
                    <th className="p-3">Текущий этап</th>
                    <th className="p-3">Дней на этапе</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {candidates.map(cand => {
                    const vac = vacancies.find(v => v.id === cand.vacancyId);
                    const days = getDaysInCurrentStage(cand);
                    const compa = cand.expectedSalary && vac 
                      ? calculateCompaRatio(cand.expectedSalary, vac.salaryMin, vac.salaryMax) 
                      : null;

                    return (
                      <tr key={cand.id} className="hover:bg-slate-800/40">
                        <td className="p-3">
                          <div className="font-semibold text-slate-100">{cand.fullName}</div>
                          <div className="text-slate-400 space-x-2 mt-0.5">
                            {cand.contacts.phone && <span>{cand.contacts.phone}</span>}
                            {cand.contacts.telegram && <span className="text-emerald-400">{cand.contacts.telegram}</span>}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {cand.skills.map(s => (
                              <span key={s} className="px-1.5 py-0.5 bg-slate-800 rounded text-[11px]">{s}</span>
                            ))}
                          </div>
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
                          <span className={`px-2 py-0.5 rounded font-medium ${days > 7 ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800 text-slate-300'}`}>
                            {days} дн.
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'scorecard' && activeCandidate && activeVacancy && (
          <div className="max-w-4xl space-y-6">
            <div className="flex items-center justify-between bg-slate-900 p-4 rounded-xl border border-slate-800">
              <div>
                <label className="text-xs text-slate-400 block">Оцениваемый кандидат:</label>
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
                      placeholder="Заметки интервьюера (конкретные ответы и артефакты опыта)..."
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-xs"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="max-w-4xl space-y-6">
            <h2 className="text-xl font-semibold">Калькулятор стоимости замены сотрудника (Turnover Cost)</h2>
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
        )}

        {activeTab === 'docs' && activeCandidate && activeVacancy && (
          <div className="max-w-3xl space-y-4">
            <h2 className="text-xl font-semibold">Генератор Оффера и Плана 30-60-90 (Markdown)</h2>
            <pre className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs whitespace-pre-wrap font-mono text-slate-200">
{`# ПРЕДЛОЖЕНИЕ О РАБОТЕ (JOB OFFER) и ПЛАН АДАПТАЦИИ
Кандидат: ${activeCandidate.fullName}
Позиция: ${activeVacancy.title} (${activeVacancy.department})
Уровень вознаграждения: ${(activeCandidate.expectedSalary || activeVacancy.salaryMin).toLocaleString('ru-RU')} ₽ (net)

## План на испытательный срок (30-60-90 дней)
- 30 дней: Изучение архитектуры проектов, стандартов схем/кода и ТБ. Выполнение 2–3 задач с наставником.
- 60 дней: Самостоятельное ведение выделенного модуля / узла автоматизации. Промежуточное ревью.
- 90 дней: Сдача целевого проекта / ПСИ и закрытие испытательного срока.`}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}