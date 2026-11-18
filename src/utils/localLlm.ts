import { Candidate, Vacancy } from '../db/schema';

export interface LocalLlmConfig {
  endpoint: string; // Например: http://localhost:1234/v1/chat/completions (LM Studio) или http://localhost:11434/v1/chat/completions (Ollama)
  model: string;
}

export const DEFAULT_LLM_CONFIG: LocalLlmConfig = {
  endpoint: 'http://localhost:1234/v1/chat/completions',
  model: 'local-model'
};

export async function analyzeCandidateWithLocalLlm(
  candidate: Candidate,
  vacancy: Vacancy,
  config: LocalLlmConfig
): Promise<string> {
  const resumeSnippet = (candidate.rawResumeText || `Навыки: ${candidate.skills.join(', ')}`).slice(0, 4500);

  const systemPrompt =
    'Ты — старший технический рекрутер и инженер. Проанализируй резюме кандидата относительно вакансии кратко, по делу, на русском языке.';

  const userPrompt = `Вакансия: ${vacancy.title} (${vacancy.department})
Вилка: ${vacancy.salaryMin} - ${vacancy.salaryMax} руб.
Ключевые компетенции вакансии: ${vacancy.competencies.map(c => c.name).join('; ')}

Кандидат: ${candidate.fullName}
Ожидания по ЗП: ${candidate.expectedSalary ? candidate.expectedSalary + ' руб.' : 'не указаны'}
Распознанный стек: ${candidate.skills.join(', ')}
Текст резюме:
${resumeSnippet}

Сформируй краткое заключение в 3 пунктах:
1. Соответствие стеку и сильные стороны (Match %).
2. Риски и белые пятна в опыте.
3. 2 точечных технических вопроса для проверки на собеседовании.`;

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model || 'local-model',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 700
    })
  });

  if (!response.ok) {
    throw new Error(`Локальный сервер LLM вернул код ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Пустой ответ от локальной модели.';
}
