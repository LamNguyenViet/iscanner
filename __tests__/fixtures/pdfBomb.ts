import { deflateSync } from 'zlib';

/**
 * A tiny PDF whose object stream inflates to `inflatedMB` of zeros: a "decompression
 * bomb" like a crafted file shared from another app.
 */
export function makePdfBomb(inflatedMB: number): Uint8Array {
  const comp = deflateSync(Buffer.alloc(inflatedMB * 1024 * 1024, 0x20), { level: 9 });
  let head = '%PDF-1.7\n';
  const offsets: number[] = [];
  const add = (s: string) => {
    offsets.push(Buffer.byteLength(head, 'latin1'));
    head += s;
  };
  add('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  add('2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n');
  offsets.push(Buffer.byteLength(head, 'latin1'));
  const body = Buffer.concat([
    Buffer.from(head, 'latin1'),
    Buffer.from(
      `3 0 obj\n<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode /Length ${comp.length} >>\nstream\n`,
      'latin1',
    ),
    comp,
    Buffer.from('\nendstream\nendobj\n', 'latin1'),
  ]);
  const xref =
    'xref\n0 4\n0000000000 65535 f \n' +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${body.length}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([body, Buffer.from(xref, 'latin1')]));
}
