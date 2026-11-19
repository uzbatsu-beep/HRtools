import { useEffect, useRef, useState } from 'react';
import { Backup, unlinkedCandidates } from '../db/backup';
import type { Vacancy } from '../db/schema';

interface Props {
  backup: Backup;
  onRestore: (backup: Backup) => Promise<void>;
  onCancel: () => void;
}

export function RepairBackup({ backup, onRestore, onCancel }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [vacancies, setVacancies] = useState(backup.vacancies);
  const [assignments, setAssignments] = useState(new Map<string, string>());
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const missing = unlinkedCandidates(backup);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  function addVacancy() {
    const title = newTitle.trim();
    if (!title) return;
    const vacancy: Vacancy = {
      id: crypto.randomUUID(), title, department: '', openedAt: new Date().toISOString().slice(0, 10),
      salaryMin: 0, salaryMax: 0, status: 'open', competencies: []
    };
    setVacancies(previous => [...previous, vacancy]);
    setNewTitle('');
  }

  async function restore() {
    setSaving(true);
    try {
      await onRestore({
        vacancies,
        candidates: backup.candidates.map(candidate => {
          const vacancyId = assignments.get(candidate.id);
          return vacancyId ? { ...candidate, vacancyId } : candidate;
        })
      });
    } finally {
      setSaving(false);
    }
  }

  return <dialog ref={dialog} aria-labelledby="repair-title" onCancel={event => {
    event.preventDefault();
    if (!saving) onCancel();
  }} className="max-h-[85vh] w-full max-w-xl overflow-auto rounded-xl border border-line bg-panel p-6 text-ink backdrop:bg-black/70">
    <h2 id="repair-title" className="text-lg font-semibold">Восстановление связей с вакансиями</h2>
    <p className="my-3 text-sm text-muted">В копии отсутствуют вакансии перечисленных кандидатов. Выберите вакансию для каждого. Изменения применятся при подтверждении восстановления.</p>
    <fieldset disabled={saving} className="space-y-3">
      {missing.map(candidate => <label key={candidate.id} className="block text-sm">
        {candidate.fullName} · {candidate.vacancyId}
        <select value={assignments.get(candidate.id) ?? ''} onChange={event => {
          const value = event.target.value;
          setAssignments(previous => new Map(previous).set(candidate.id, value));
        }} className="mt-1 block w-full rounded border border-line bg-canvas p-2">
          <option value="">Выберите вакансию</option>
          {vacancies.map(vacancy => <option key={vacancy.id} value={vacancy.id}>{vacancy.title}</option>)}
        </select>
      </label>)}
      <label className="block text-sm">Название новой вакансии
        <input value={newTitle} onChange={event => setNewTitle(event.target.value)} className="mt-1 block w-full rounded border border-line bg-canvas p-2" />
      </label>
      <button type="button" disabled={!newTitle.trim()} onClick={addVacancy} className="rounded bg-subtle px-3 py-2 text-sm disabled:opacity-50">Добавить вакансию в копию</button>
      <div className="flex gap-2">
        <button type="button" disabled={missing.some(c => !assignments.get(c.id))} onClick={restore} className="rounded bg-accent-fill px-3 py-2 text-on-accent disabled:opacity-50">Восстановить базу</button>
        <button type="button" onClick={onCancel} className="rounded bg-subtle px-3 py-2">Отмена</button>
      </div>
    </fieldset>
  </dialog>;
}
