import * as pdfjsLib from 'pdfjs-dist';
// Локальная упаковка воркера через Vite (работает 100% офлайн и в Tauri .exe)
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (ext === 'pdf') {
    return extractFromPdf(file);
  }
  if (ext === 'docx') {
    return extractFromDocx(file);
  }
  if (ext === 'txt' || ext === 'md') {
    return await file.text();
  }

  throw new Error(`Формат .${ext} не поддерживается. Используйте PDF, DOCX, TXT или MD.`);
}

async function extractFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageLines = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ');
    pageTexts.push(pageLines);
  }

  return pageTexts.join('\n\n');
}

async function extractFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}
