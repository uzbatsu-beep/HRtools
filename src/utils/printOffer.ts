import { Candidate, OfferDraft, Vacancy } from '../db/schema';

export function populateOfferDocument(doc: Document, candidate: Candidate, vacancy: Vacancy, draft: OfferDraft, root: HTMLElement = doc.body) {
  const add = (tag: string, value: string, parent: HTMLElement = root) => {
    const element = doc.createElement(tag);
    element.textContent = value;
    parent.appendChild(element);
    return element;
  };
  add('h1', 'Предложение о работе и план адаптации');
  for (const [label, value] of [
    ['Компания', draft.companyName], ['Кандидат', candidate.fullName], ['Должность', vacancy.title],
    ['Подразделение', vacancy.department], ['Вознаграждение', `${draft.salary} ₽ / мес. (${draft.salaryBasis})`],
    ['Дата выхода', draft.startDate], ['Испытательный срок', `${draft.probationMonths} мес.`], ['Наставник', draft.mentorName]
  ]) add('p', `${label}: ${value || 'Не указано'}`).className = 'field';
  for (const [label, text] of [['Первые 30 дней', draft.plan30], ['60 дней', draft.plan60], ['90 дней', draft.plan90]]) {
    add('h2', label);
    const list = add('ul', '');
    for (const line of text.split(/\r?\n/).map(s => s.trim().replace(/^[-•*]\s*/, '')).filter(Boolean)) add('li', line, list);
  }
}

export function printOffer(candidate: Candidate, vacancy: Vacancy, draft: OfferDraft): boolean {
  if (typeof window.print !== 'function') return false;
  document.querySelectorAll('.hrtools-offer-print').forEach(element => element.remove());
  const root = document.createElement('section');
  root.className = 'hrtools-offer-print';
  populateOfferDocument(document, candidate, vacancy, draft, root);
  document.body.appendChild(root);
  const cleanup = () => root.remove();
  window.addEventListener('afterprint', cleanup, { once: true });
  try {
    window.print();
    return true;
  } catch {
    window.removeEventListener('afterprint', cleanup);
    cleanup();
    return false;
  }
}
