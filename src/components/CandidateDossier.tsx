import { useState } from 'react';
import { Candidate, CandidateStage, Vacancy } from '../db/schema';

interface Props {
  candidate: Candidate;
  vacancy?: Vacancy;
  labels: Record<CandidateStage, string>;
  onClose: () => void;
  onSave: (contacts: Candidate['contacts'], expectedSalary: number | undefined) => Promise<void>;
}

export function CandidateDossier({ candidate, vacancy, labels, onClose, onSave }: Props) {
  const [contacts, setContacts] = useState(candidate.contacts);
  const [salary, setSalary] = useState(candidate.expectedSalary?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(() => JSON.stringify([candidate.contacts, candidate.expectedSalary?.toString() ?? '']));
  const close = () => {
    if (JSON.stringify([contacts, salary]) !== saved && !window.confirm('Есть несохранённые изменения досье. Закрыть?')) return;
    onClose();
  };
  const save = async () => {
    if (salary !== '' && (!Number.isFinite(Number(salary)) || Number(salary) < 0)) { setMessage('Укажите корректные зарплатные ожидания.'); return; }
    setSaving(true);
    try { await onSave(contacts, salary === '' ? undefined : Number(salary)); setSaved(JSON.stringify([contacts, salary])); setMessage('Изменения сохранены.'); }
    catch { setMessage('Не удалось сохранить изменения.'); }
    finally { setSaving(false); }
  };
  return <div className="fixed inset-0 z-50 bg-black/70 flex justify-end" role="presentation">
    <section role="dialog" aria-modal="true" aria-label={`Досье: ${candidate.fullName}`} className="w-full max-w-2xl bg-slate-900 p-6 overflow-y-auto space-y-4">
      <div className="flex justify-between"><h2 className="text-xl font-semibold">{candidate.fullName}</h2><button onClick={close} aria-label="Закрыть досье">✕</button></div>
      <p className="text-sm text-slate-400">{vacancy?.title ?? 'Вакансия не найдена'} · {labels[candidate.stage]}</p>
      <div className="grid grid-cols-2 gap-3">
        {(['phone', 'email', 'telegram', 'github'] as const).map(key => <label key={key} className="text-xs text-slate-400">{key}
          <input value={contacts[key] ?? ''} onChange={e => { setContacts(prev => ({ ...prev, [key]: e.target.value })); setMessage(''); }} className="block w-full mt-1 p-2 rounded bg-slate-950 text-slate-100" />
        </label>)}
        <label className="text-xs text-slate-400">Ожидания по зарплате
          <input type="number" min="0" value={salary} onChange={e => { setSalary(e.target.value); setMessage(''); }} className="block w-full mt-1 p-2 rounded bg-slate-950 text-slate-100" />
        </label>
      </div>
      <button disabled={saving} onClick={save} className="bg-emerald-600 px-3 py-2 rounded text-sm">Сохранить изменения</button> <span role="status" className="text-xs text-slate-300">{message}</span>
      <p className="text-xs text-slate-400">Изменения полей сохраняются по кнопке.</p>
      <h3 className="font-semibold">История этапов</h3>
      <ul className="text-sm text-slate-300">{candidate.stageHistory.map((item, i) => <li key={i}>{item.enteredAt} — {labels[item.stage]}</li>)}</ul>
      {candidate.aiSummary && <><h3 className="font-semibold">AI-разбор</h3><p className="whitespace-pre-wrap text-sm">{candidate.aiSummary}</p></>}
      <h3 className="font-semibold">Текст резюме</h3><p className="whitespace-pre-wrap text-sm text-slate-300">{candidate.rawResumeText || 'Текст резюме отсутствует.'}</p>
    </section>
  </div>;
}
