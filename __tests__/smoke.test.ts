import { PDFDocument } from '../src/pdf/pdfLib';
test('pdf-lib loads under jest', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  expect(doc.getPageCount()).toBe(1);
});
