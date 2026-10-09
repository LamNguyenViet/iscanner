import fs from 'fs';
import JSZip from 'jszip';
import { docToHtml, docxToHtml, escapeHtml, readDocxPageSetup } from '../../src/convert/html';
import { A4_PAGE } from '../../src/convert/types';
import { makeDocx, SAMPLE_DOC_FIRST_LINE, SAMPLE_DOC_PATH, VI_TEXT } from '../fixtures/word';

test('escapeHtml', () => {
  expect(escapeHtml('<a&"b>')).toBe('&lt;a&amp;&quot;b&gt;');
});

test('docx to html keeps structure and Vietnamese text', async () => {
  const { html, page } = await docxToHtml(await makeDocx());
  expect(html).toContain('<h1>');
  expect(html).toContain('<strong>');
  expect(html).toContain('<table>');
  expect(html).toContain(VI_TEXT);
  expect(html).toContain('<meta charset="utf-8">');
  expect(page.width).toBeCloseTo(A4_PAGE.width, 0);
  expect(Math.abs(page.width - A4_PAGE.width)).toBeLessThan(0.5);
  expect(Math.abs(page.height - A4_PAGE.height)).toBeLessThan(0.5);
  expect(page.margin.left).toBeCloseTo(56.7, 0);
});

test('images become data URIs', async () => {
  const { html } = await docxToHtml(await makeDocx({ withImage: true }));
  expect(html).toContain('src="data:image/png;base64,');
});

test('Letter page size', async () => {
  const { html, page } = await docxToHtml(await makeDocx({ pageSize: 'Letter' }));
  expect(page.width).toBeCloseTo(612, 0);
  expect(page.height).toBeCloseTo(792, 0);
  expect(html).toContain('@page { size: 612pt 792pt');
});

test('missing pgSz falls back to A4', async () => {
  const zip = await JSZip.loadAsync(await makeDocx());
  const xml = await zip.file('word/document.xml')!.async('string');
  zip.file('word/document.xml', xml.replace(/<w:pgSz[^>]*\/>/, ''));
  const bytes = new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
  expect(await readDocxPageSetup(bytes)).toEqual(A4_PAGE);
});

test('doc to html', async () => {
  const { html, page } = await docToHtml(new Uint8Array(fs.readFileSync(SAMPLE_DOC_PATH)));
  expect(html).toContain(`<p>${escapeHtml(SAMPLE_DOC_FIRST_LINE)}</p>`);
  expect(page).toEqual(A4_PAGE);
});
