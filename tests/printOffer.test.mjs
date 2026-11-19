import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({ entryPoints: ['src/utils/printOffer.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { populateOfferDocument } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`);

test('offer content is rendered as text and includes independent offer terms', () => {
  const element = tag => ({ tag, textContent: '', children: [], appendChild(child) { this.children.push(child); return child; } });
  const doc = { head: element('head'), body: element('body'), createElement: element };
  const candidate = { fullName: '<img src=x onerror=alert(1)>', expectedSalary: 100 };
  const vacancy = { title: 'Engineer', department: 'R&D' };
  const draft = { companyName: '<script>bad()</script>', mentorName: '', salary: '250', salaryBasis: 'gross', startDate: '2027-01-01', probationMonths: '3', plan30: '- <b>task</b>', plan60: '', plan90: '' };
  populateOfferDocument(doc, candidate, vacancy, draft);
  const nodes = []; const visit = node => { nodes.push(node); node.children.forEach(visit); }; visit(doc.body);
  assert.ok(nodes.some(n => n.textContent.includes(candidate.fullName)));
  assert.ok(nodes.some(n => n.textContent.includes('250 ₽ / мес. (gross)')));
  assert.ok(nodes.some(n => n.tag === 'li' && n.textContent === '<b>task</b>'));
  assert.ok(!nodes.some(n => ['script', 'img', 'b'].includes(n.tag)));
});
