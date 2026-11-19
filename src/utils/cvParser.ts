export interface ParsedResume {
  fullName: string;
  phone?: string;
  email?: string;
  telegram?: string;
  github?: string;
  expectedSalary?: number;
  detectedSkills: string[];
}

const KNOWN_SKILLS_DICTIONARY = [
  'Python', 'FastAPI', 'Django', 'Flask', 'SQL', 'PostgreSQL', 'Docker', 'Podman',
  'Git', 'Linux', 'React', 'TypeScript', 'C++', 'C#', 'MinGW',
  'АСУ ТП', 'ПЛК', 'PLC', 'SCADA', 'CODESYS', 'Siemens', 'TIA Portal', 'Simatic',
  'WinCC', 'Schneider Electric', 'Festo', 'XINJE', 'Owen', 'Овен', 'MasterSCADA',
  'Modbus', 'Profibus', 'Profinet', 'OPC UA', 'КИПиА', 'EPLAN', 'QElectroTech', 'AutoCAD'
];

export function parseRawResumeText(rawText: string): ParsedResume {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  let fullName = 'Новый кандидат';
  for (const line of lines.slice(0, 6)) {
    if (/^[А-ЯЁA-Z][а-яёa-z]+(\s+[А-ЯЁA-Z][а-яёa-z]+){1,2}$/.test(line)) {
      fullName = line;
      break;
    }
  }

  const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = rawText.match(/(?:\+7|8)[\s\-()]*\d{3}[\s\-()]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/);
  const tgMatch = rawText.match(/(?:\bt\.me\/|(?:^|[\s(:,;])@)([a-zA-Z0-9_]{4,32})\b/i);
  const ghMatch = rawText.match(/github\.com\/[a-zA-Z0-9_-]+/);
  const salaryMatch = rawText.match(/(\d{2,3}[\s\u00A0]?\d{3})\s*(?:руб|₽|RUB|р\.)/i);
  const expectedSalary = salaryMatch 
    ? parseInt(salaryMatch[1].replace(/[\s\u00A0]/g, ''), 10) 
    : undefined;

  const lowerText = rawText.toLowerCase();
  const detectedSkills = KNOWN_SKILLS_DICTIONARY.filter(skill => 
    lowerText.includes(skill.toLowerCase())
  );

  return {
    fullName,
    phone: phoneMatch ? phoneMatch[0].trim() : undefined,
    email: emailMatch ? emailMatch[0].trim() : undefined,
    telegram: tgMatch ? `@${tgMatch[1]}` : undefined,
    github: ghMatch ? ghMatch[0] : undefined,
    expectedSalary,
    detectedSkills
  };
}
