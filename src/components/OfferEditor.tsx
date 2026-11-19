import { useEffect, useState } from 'react';
import { Candidate, OfferDraft, Vacancy } from '../db/schema';
import { printOffer } from '../utils/printOffer';

const emptyDraft: OfferDraft = { companyName: '', mentorName: '', salary: '', salaryBasis: 'net', startDate: '', probationMonths: '', plan30: '', plan60: '', plan90: '' };
interface Props {
  candidate: Candidate;
  vacancy: Vacancy;
  candidates: Candidate[];
  onSelect: (id: string) => void;
  onSave: (draft: OfferDraft) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export function OfferEditor({ candidate, vacancy, candidates, onSelect, onSave, onDirtyChange }: Props) {
  const [draft, setDraft] = useState<OfferDraft>(() => ({ ...emptyDraft, ...candidate.offerDraft }));
  const [saved, setSaved] = useState(() => JSON.stringify({ ...emptyDraft, ...candidate.offerDraft }));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(draft) !== saved;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const update = (key: keyof OfferDraft, value: string) => { setDraft(prev => ({ ...prev, [key]: value })); setMessage(''); };
  const print = () => {
    if (!draft.companyName.trim() || !draft.salary || !Number.isFinite(Number(draft.salary)) || Number(draft.salary) <= 0 || !draft.startDate) {
      setMessage('Для печати укажите компанию, положительный оклад и дату выхода.');
      return;
    }
    if (!printOffer(candidate, vacancy, draft)) setMessage('Не удалось открыть системный диалог печати.');
  };
  const save = async () => {
    if ((draft.salary && (!Number.isFinite(Number(draft.salary)) || Number(draft.salary) < 0)) || (draft.probationMonths && (!Number.isFinite(Number(draft.probationMonths)) || Number(draft.probationMonths) < 0))) { setMessage('Проверьте сумму и срок испытания.'); return; }
    setBusy(true);
    try { await onSave(draft); setSaved(JSON.stringify(draft)); setMessage('Черновик сохранён.'); }
    catch { setMessage('Не удалось сохранить черновик.'); }
    finally { setBusy(false); }
  };
  return <div className="max-w-4xl space-y-4">
    <h2 className="text-xl font-semibold">Оффер и план адаптации 30-60-90</h2>
    <p className="text-xs text-muted">Сохраняйте черновик отдельно для каждого кандидата. Ожидания кандидата не изменяются.</p>
    <label className="text-xs text-muted">Кандидат
      <select value={candidate.id} onChange={e => { if (!dirty || window.confirm('Есть несохранённые изменения оффера. Переключить кандидата?')) onSelect(e.target.value); }} className="block w-full mt-1 bg-canvas border border-line rounded p-2 text-sm">
        {candidates.map(c => <option key={c.id} value={c.id}>{c.fullName}</option>)}
      </select>
    </label>
    <p className="text-sm text-ink-soft">Вакансия: {vacancy.title}</p>
    <div className="grid grid-cols-2 gap-3">
      {([['companyName', 'Компания / юрлицо', 'text'], ['mentorName', 'Наставник', 'text'], ['salary', 'Предложенный оклад, ₽/мес.', 'number'], ['startDate', 'Дата выхода', 'date'], ['probationMonths', 'Испытательный срок, месяцев', 'number']] as const).map(([key, label, type]) => <label key={key} className="text-xs text-muted">{label}<input type={type} min={type === 'number' ? '0' : undefined} value={draft[key]} onChange={e => update(key, e.target.value)} className="block w-full mt-1 bg-canvas border border-line rounded p-2 text-sm text-ink" /></label>)}
      <label className="text-xs text-muted">Оклад указан<select value={draft.salaryBasis} onChange={e => update('salaryBasis', e.target.value)} className="block w-full mt-1 bg-canvas border border-line rounded p-2 text-sm"><option value="net">На руки (net)</option><option value="gross">До вычета налогов (gross)</option></select></label>
    </div>
    {([['plan30', 'Первые 30 дней'], ['plan60', '60 дней'], ['plan90', '90 дней']] as const).map(([key, label]) => <label key={key} className="block text-xs text-muted">{label}<textarea value={draft[key]} onChange={e => update(key, e.target.value)} className="block w-full mt-1 h-24 bg-canvas border border-line rounded p-2 text-sm text-ink" placeholder="Одна задача на строку" /></label>)}
    <div className="flex gap-3 items-center"><button disabled={busy} onClick={save} className="bg-accent-fill rounded px-4 py-2 text-sm text-on-accent hover:bg-accent-hover">Сохранить черновик</button><button onClick={print} className="bg-raised rounded px-4 py-2 text-sm">Открыть печать / PDF</button><span role="status" className="text-xs text-ink-soft">{message}{dirty && !message ? 'Есть несохранённые изменения.' : ''}</span></div>
  </div>;
}
