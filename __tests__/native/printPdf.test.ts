import * as Print from 'expo-print';
import { printHtmlToPdf } from '../../src/native/printPdf';
import { A4_PAGE } from '../../src/convert/types';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));

test('prints html with the page setup and returns the uri', async () => {
  (Print.printToFileAsync as jest.Mock).mockResolvedValue({ uri: 'file:///cache/x.pdf', numberOfPages: 1 });
  const uri = await printHtmlToPdf('<p>hi</p>', A4_PAGE);
  expect(uri).toBe('file:///cache/x.pdf');
  expect(Print.printToFileAsync).toHaveBeenCalledWith({
    html: '<p>hi</p>',
    width: 595.28,
    height: 841.89,
    margins: { top: 56.69, right: 56.69, bottom: 56.69, left: 56.69 },
  });
});
