import { BooleanPreset, Vacancy, Candidate } from './schema';

export const REJECTION_REASONS = [
  'Компания: Слабый технический уровень (Hard Skills)',
  'Компания: Не совпали по культуре / Soft Skills',
  'Компания: Завышенные зарплатные ожидания',
  'Компания: Не прошел проверку СБ',
  'Кандидат: Принял контроффер на текущем месте',
  'Кандидат: Выбрал оффер другой компании (выше ЗП)',
  'Кандидат: Не устроил график / формат работы (офис/удаленка)',
  'Кандидат: Перестал выходить на связь (Ghosting)'
];

export const BOOLEAN_PRESETS: BooleanPreset[] = [
  {
    id: 'asutp',
    name: 'Инженер АСУ ТП / ПЛК',
    titles: ['АСУ ТП', 'АСУТП', 'Инженер-программист ПЛК', 'PLC Engineer', 'Автоматизация'],
    mustHave: ['ПЛК', 'SCADA', 'КИПиА'],
    alternatives: ['CODESYS', 'Siemens', 'TIA Portal', 'Simatic', 'Schneider Electric', 'Owen', 'Овен', 'WinCC', 'MasterSCADA', 'Modbus', 'Profibus'],
    exclude: ['стажер', 'intern', 'помощник', 'курсы', 'обучение']
  },
  {
    id: 'python-backend',
    name: 'Python Backend Developer',
    titles: ['Python Developer', 'Backend разработчик', 'Python Engineer'],
    mustHave: ['Python', 'SQL', 'Git'],
    alternatives: ['FastAPI', 'Django', 'Flask', 'asyncio', 'PostgreSQL', 'Docker', 'RabbitMQ', 'Redis', 'Celery'],
    exclude: ['junior', 'стажер', 'ментор', 'преподаватель', 'курсы']
  },
  {
    id: 'qa-auto',
    name: 'QA Automation Engineer',
    titles: ['QA Automation', 'Автотестировщик', 'SDET', 'Инженер по автоматизации тестирования'],
    mustHave: ['QA', 'API', 'Git'],
    alternatives: ['Pytest', 'Playwright', 'Selenium', 'Cypress', 'Allure', 'Postman', 'CI/CD'],
    exclude: ['manual only', 'стажер', 'курсы']
  }
];

export const INITIAL_VACANCIES: Vacancy[] = [
  {
    id: 'vac-1',
    title: 'Ведущий инженер АСУ ТП',
    department: 'Департамент промышленной автоматизации',
    openedAt: '2026-10-15',
    salaryMin: 160000,
    salaryMax: 220000,
    status: 'open',
    competencies: [
      {
        id: 'c1',
        name: 'Программирование ПЛК (CODESYS / TIA Portal)',
        weight: 3,
        category: 'hard',
        starPrompt: 'Опишите самый сложный контур управления или алгоритм блокировок, который вы разрабатывали с нуля и запускали в ПНР.'
      },
      {
        id: 'c2',
        name: 'Промышленные сети и протоколы (Modbus, Profinet, OPC UA)',
        weight: 3,
        category: 'hard',
        starPrompt: 'Расскажите о случае потери связи или помех на объекте: как диагностировали проблему на уровне физики/протокола и как решили?'
      },
      {
        id: 'c3',
        name: 'Чтение электрических схем и P&ID (QElectroTech / EPLAN)',
        weight: 2,
        category: 'hard',
        starPrompt: 'Приходилось ли находить критические ошибки в проектной документации прямо на площадке во время ШМР/ПНР? Как действовали?'
      },
      {
        id: 'c4',
        name: 'Автономность и стрессоустойчивость на ПНР',
        weight: 2,
        category: 'soft',
        starPrompt: 'Опишите ситуацию, когда заказчик требовал сдать систему в сжатые сроки при неготовности смежников.'
      }
    ]
  },
  {
    id: 'vac-2',
    title: 'Middle+ Python Developer',
    department: 'R&D и внутренние продукты',
    openedAt: '2026-10-28',
    salaryMin: 200000,
    salaryMax: 270000,
    status: 'open',
    competencies: [
      {
        id: 'c5',
        name: 'Архитектура API и асинхронность (FastAPI / asyncio)',
        weight: 3,
        category: 'hard',
        starPrompt: 'Расскажите про сервис, который не справлялся с нагрузкой: как профилировали узкое место и что переписали?'
      },
      {
        id: 'c6',
        name: 'Оптимизация баз данных (PostgreSQL)',
        weight: 2,
        category: 'hard',
        starPrompt: 'Приведите пример сложного SQL-запроса или миграции, которую вы оптимизировали через EXPLAIN ANALYZE.'
      }
    ]
  }
];

export const INITIAL_CANDIDATES: Candidate[] = [
  {
    id: 'cand-1',
    vacancyId: 'vac-1',
    fullName: 'Смирнов Алексей Викторович',
    contacts: { phone: '+7 (912) 345-67-89', email: 'a.smirnov.plc@mail.ru', telegram: '@smirnov_plc' },
    skills: ['CODESYS', 'Siemens', 'TIA Portal', 'Modbus', 'SCADA', 'EPLAN'],
    source: 'search',
    stage: 'tech_interview',
    expectedSalary: 195000,
    stageHistory: [
      { stage: 'screening', enteredAt: '2026-10-20' },
      { stage: 'hr_interview', enteredAt: '2026-10-23' },
      { stage: 'tech_interview', enteredAt: '2026-10-29' }
    ],
    scores: {
      c1: { score: 5, note: 'Отличный опыт с CODESYS 3.5 и ST/FBD, сам писал библиотеки.' },
      c2: { score: 4, note: 'Глубоко знает Modbus RTU/TCP и OPC UA.' },
      c3: { score: 4, note: 'Сам корректирует схемы в EPLAN и QElectroTech.' },
      c4: { score: 5, note: 'Спокойный, 6 лет опыта пусконаладки на крупных заводах.' }
    }
  },
  {
    id: 'cand-2',
    vacancyId: 'vac-1',
    fullName: 'Воронов Дмитрий Игоревич',
    contacts: { phone: '+7 (922) 111-22-33', email: 'voronov.d@yandex.ru', telegram: '@d_voronov' },
    skills: ['Owen', 'MasterSCADA', 'КИПиА', 'Modbus'],
    source: 'inbound',
    stage: 'rejected',
    rejectionReason: 'Компания: Слабый технический уровень (Hard Skills)',
    expectedSalary: 180000,
    stageHistory: [
      { stage: 'screening', enteredAt: '2026-10-18' },
      { stage: 'hr_interview', enteredAt: '2026-10-21' },
      { stage: 'rejected', enteredAt: '2026-10-25' }
    ],
    scores: {}
  },
  {
    id: 'cand-3',
    vacancyId: 'vac-2',
    fullName: 'Ковалев Артем Сергеевич',
    contacts: { phone: '+7 (999) 888-77-66', email: 'artem.py@gmail.com', telegram: '@artem_dev', github: 'github.com/artempy' },
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker', 'Git', 'Linux'],
    source: 'referral',
    stage: 'offer',
    expectedSalary: 240000,
    stageHistory: [
      { stage: 'screening', enteredAt: '2026-11-01' },
      { stage: 'hr_interview', enteredAt: '2026-11-03' },
      { stage: 'tech_interview', enteredAt: '2026-11-07' },
      { stage: 'offer', enteredAt: '2026-11-12' }
    ],
    scores: {
      c5: { score: 5, note: 'Чистый асинхронный код, отличное понимание ивент-лупа.' },
      c6: { score: 4, note: 'Уверенно работает с индексами и транзакциями.' }
    }
  }
];