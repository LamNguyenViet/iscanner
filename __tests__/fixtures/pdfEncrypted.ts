/** A minimal PDF whose trailer carries an /Encrypt entry: PDFDocument.load rejects it with EncryptedPDFError. */
export function makePdfEncrypted(): Uint8Array {
  let head = '%PDF-1.7\n';
  const offsets: number[] = [];
  const add = (s: string) => {
    offsets.push(Buffer.byteLength(head, 'latin1'));
    head += s;
  };
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  add('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
  add('3 0 obj\n<< /Filter /Standard /V 1 /R 2 /O (x) /U (x) /P -4 >>\nendobj\n');
  const xrefPos = Buffer.byteLength(head, 'latin1');
  const xref =
    'xref\n0 4\n0000000000 65535 f \n' +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size 4 /Root 1 0 R /Encrypt 3 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(head + xref, 'latin1'));
}
