import { Candidate, OfferDraft, Vacancy } from '../db/schema';

export function populateOfferDocument(doc: Document, candidate: Candidate, vacancy: Vacancy, draft: OfferDraft) {
  doc.title = `Предложение о работе — ${candidate.fullName}`;
  const style = doc.createElement('style');
  style.textContent = '@page { size: A4; margin: 16mm } body { font: 14px Arial, sans-serif; color: #172033; line-height: 1.5 } h1,h2 { color: #047857 } .field { margin: 8px 0 } li { margin-bottom: 5px }';
  doc.head.appendChild(style);
  const add = (tag: string, value: string, parent: HTMLElement = doc.body) => {
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
  const popup = window.open('', '_blank', 'width=960,height=900');
  if (!popup) return false;
  populateOfferDocument(popup.document, candidate, vacancy, draft);
  popup.focus();
  popup.print();
  return true;
}
