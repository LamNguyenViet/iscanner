import path from 'path';
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
} from 'docx';
import { encrypt } from 'officecrypto-tool';
import { makePng } from './images';

/**
 * sample.doc is test01.doc from morungos/node-word-extractor (__tests__/data), MIT licence.
 * Word 97-2003 binary, 22,528 bytes. First line of text:
 * "A second test of reviewing, but with Unicode characters in to see if character offsets get broken. 😀 ∀"
 */
export const SAMPLE_DOC_PATH = path.join(__dirname, 'sample.doc');

export const SAMPLE_DOC_FIRST_LINE =
  'A second test of reviewing, but with Unicode characters in to see if character offsets get broken. 😀 ∀';

export const VI_TEXT = 'Xin chào thế giới, đây là văn bản tiếng Việt';

export async function makeDocx(
  opts: { pageSize?: 'A4' | 'Letter'; withImage?: boolean; text?: string } = {},
): Promise<Uint8Array> {
  const text = opts.text ?? VI_TEXT;
  const letter = opts.pageSize === 'Letter';
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: 'Tiêu đề', heading: HeadingLevel.HEADING_1 }),
    new Paragraph({ children: [new TextRun({ text, bold: true })] }),
    new Table({
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('A1')] }),
            new TableCell({ children: [new Paragraph('B1')] }),
          ],
        }),
      ],
    }),
  ];
  if (opts.withImage) {
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: 'png',
            data: Buffer.from(makePng(8, 8)),
            transformation: { width: 8, height: 8 },
          }),
        ],
      }),
    );
  }
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: letter
              ? { width: 12240, height: 15840, orientation: PageOrientation.PORTRAIT }
              : { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
          },
        },
        children,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export async function makeEncryptedDocx(password = 'secret'): Promise<Uint8Array> {
  const plain = await makeDocx();
  return new Uint8Array(await encrypt(Buffer.from(plain), { password }));
}

export async function makeStandardEncryptedDocx(password = 'secret'): Promise<Uint8Array> {
  const plain = await makeDocx();
  return new Uint8Array(await encrypt(Buffer.from(plain), { password, type: 'standard' }));
}
