import * as DocumentPicker from 'expo-document-picker';
import { WORD_MIME_TYPES, pickDocuments } from '../../src/native/pickPdfs';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

test('WORD_MIME_TYPES are the two Word types', () => {
  expect(WORD_MIME_TYPES).toEqual([
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);
});

test('pickDocuments passes the types through', async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///a.docx', name: 'a.docx' }],
  });
  const out = await pickDocuments(WORD_MIME_TYPES);
  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ type: WORD_MIME_TYPES }));
  expect(out).toEqual([{ uri: 'file:///a.docx', name: 'a.docx' }]);
});
