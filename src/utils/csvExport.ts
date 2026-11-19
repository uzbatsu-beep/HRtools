import { Candidate, Vacancy, CandidateStage } from '../db/schema';
import { 
  getDaysInCurrentStage, 
  calculateWeightedScore, 
  calculateCompaRatio, 
  FunnelStepMetric, 
  RejectionMetric 
} from './metricsMath';

export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '""';
  const value = String(val);
  // Spreadsheet applications can execute formulas even inside quoted CSV cells.
  const safe = /^[\s\uFEFF]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  const str = safe.replace(/"/g, '""').replace(/\r\n|\r|\n/g, ' ');
  return `"${str}"`;
}

function triggerCsvDownload(filename: string, rows: string[][]) {
  // \uFEFF (UTF-8 BOM) гарантирует корректное открытие кириллицы в MS Excel, ";" — стандартный разделитель колонок для RU-локали
  const csvContent = '\uFEFF' + rows.map(r => r.map(escapeCsvCell).join(';')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCandidatesToCsv(
  candidates: Candidate[],
  vacancies: Vacancy[],
  stageLabels: Record<CandidateStage, string>
) {
  const vacMap = new Map(vacancies.map(v => [v.id, v]));

  const headers = [
    'ID кандидата',
    'ФИО',
    'Вакансия',
    'Подразделение',
    'Текущий этап',
    'Дней на этапе',
    'Ожидания ЗП (руб)',
    'Compa-Ratio (%)',
    'Оценка попадания в грейд',
    'Средневзвешенный балл (из 5)',
    'Телефон',
    'Email',
    'Telegram',
    'GitHub',
    'Распознанный стек',
    'Причина отказа',
    'AI-резюме (LM Studio / Ollama)'
  ];

  const rows = candidates.map(c => {
    const vac = vacMap.get(c.vacancyId);
    const days = getDaysInCurrentStage(c);
    const score = vac ? calculateWeightedScore(vac.competencies, c.scores) : 0;
    const compa = (c.expectedSalary && vac)
      ? calculateCompaRatio(c.expectedSalary, vac.salaryMin, vac.salaryMax)
      : null;

    return [
      c.id,
      c.fullName,
      vac?.title || 'Неизвестная вакансия',
      vac?.department || '—',
      stageLabels[c.stage] || c.stage,
      String(days),
      c.expectedSalary ? String(c.expectedSalary) : '',
      compa ? String(compa.ratio) : '',
      compa ? compa.zone : '',
      score > 0 ? String(score) : '',
      c.contacts.phone || '',
      c.contacts.email || '',
      c.contacts.telegram || '',
      c.contacts.github || '',
      c.skills.join(', '),
      c.rejectionReason || '',
      c.aiSummary || ''
    ];
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`hrtools-candidates-${dateStr}.csv`, [headers, ...rows]);
}

export function exportAnalyticsToCsv(
  funnelSteps: FunnelStepMetric[],
  rejectionMetrics: RejectionMetric[],
  vacancyTitle: string
) {
  const rows: string[][] = [
    ['ОТЧЕТ ПО ВОРОНКЕ РЕКРУТИНГА И ПРИЧИНАМ ОТКАЗОВ'],
    ['Фильтр вакансии', vacancyTitle],
    ['Дата выгрузки', new Date().toISOString().slice(0, 10)],
    [],
    ['1. ЗАПИСАННЫЕ ЭТАПЫ И ПЕРЕХОДЫ'],
    ['Переход: доля достигших предыдущего этапа, которые также побывали на текущем'],
    ['Этап воронки', 'Дошли до этапа (чел)', 'Сейчас на этапе (чел)', 'Конверсия от входа (%)', 'Конверсия из пред. этапа (%)']
  ];

  for (const s of funnelSteps) {
    rows.push([
      s.label,
      String(s.reachedCount),
      String(s.currentCount),
      `${s.conversionFromTop}%`,
      `${s.conversionFromPrev}%`
    ]);
  }

  rows.push([]);
  rows.push(['2. СТРУКТУРА ПРИЧИН ОТКАЗОВ']);
  rows.push(['Причина отказа', 'Количество отказов', 'Доля (%)']);

  for (const r of rejectionMetrics) {
    rows.push([
      r.reason,
      String(r.count),
      `${r.sharePercent}%`
    ]);
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`hrtools-analytics-${dateStr}.csv`, rows);
}

export function exportComparisonMatrixToCsv(
  vacancy: Vacancy,
  comparedCandidates: Candidate[],
  stageLabels: Record<CandidateStage, string>
) {
  const headers = [
    'Критерий / Компетенция',
    'Вес / Вилка',
    ...comparedCandidates.map(c => c.fullName)
  ];

  const rows: string[][] = [
    headers,
    [
      'Текущий этап воронки',
      '—',
      ...comparedCandidates.map(c => stageLabels[c.stage] || c.stage)
    ],
    [
      'Ожидания по зарплате (руб)',
      `${vacancy.salaryMin} - ${vacancy.salaryMax}`,
      ...comparedCandidates.map(c => c.expectedSalary ? `${c.expectedSalary} руб.` : 'Не указано')
    ],
    [
      'Compa-Ratio (%)',
      'Медиана 100%',
      ...comparedCandidates.map(c => {
        if (!c.expectedSalary) return '—';
        const cr = calculateCompaRatio(c.expectedSalary, vacancy.salaryMin, vacancy.salaryMax);
        return `${cr.ratio}% (${cr.zone})`;
      })
    ],
    [
      'ИТОГОВЫЙ СРЕДНЕВЗВЕШЕННЫЙ БАЛЛ',
      'Макс. 5.0',
      ...comparedCandidates.map(c => {
        const evaluated = vacancy.competencies.filter(comp => c.scores[comp.id]?.score > 0).length;
        return evaluated ? `${calculateWeightedScore(vacancy.competencies, c.scores)} / 5.0 (${evaluated}/${vacancy.competencies.length} оценено)` : 'Не оценено';
      })
    ]
  ];

  for (const comp of vacancy.competencies) {
    rows.push([
      comp.name,
      `x${comp.weight} (${comp.category.toUpperCase()})`,
      ...comparedCandidates.map(c => {
        const entry = c.scores[comp.id];
        if (!entry || !entry.score) return 'Не оценено';
        return `${entry.score}/5${entry.note ? ` (${entry.note})` : ''}`;
      })
    ]);
  }

  rows.push([
    'Распознанный стек',
    '—',
    ...comparedCandidates.map(c => c.skills.join(', '))
  ]);

  const dateStr = new Date().toISOString().slice(0, 10);
  triggerCsvDownload(`hrtools-comparison-${vacancy.id}-${dateStr}.csv`, rows);
}
