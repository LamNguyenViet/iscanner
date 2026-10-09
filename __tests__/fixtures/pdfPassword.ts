import { createHash, randomBytes } from 'crypto';

const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const pad = (pw: string) => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
const md5 = (...parts: Buffer[]) => createHash('md5').update(Buffer.concat(parts)).digest();

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[k] = data[k] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

/** A one-page RC4 40-bit (V1/R2) password-protected PDF. `withLength: false` omits /Length from the Encrypt dict. */
export function makePasswordPdf(
  opts: { userPassword?: string; ownerPassword?: string; withLength?: boolean; text?: string } = {},
): Uint8Array {
  const { userPassword = 'secret', ownerPassword = 'owner', withLength = true, text = 'Secret page' } = opts;
  const id = randomBytes(16);
  const P = -44;
  const O = rc4(md5(pad(ownerPassword)).subarray(0, 5), pad(userPassword));
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(P);
  const key = md5(pad(userPassword), O, pBytes, id).subarray(0, 5);
  const U = rc4(key, PAD);
  const objKey = (n: number) => md5(key, Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, 0, 0])).subarray(0, 10);
  const content = rc4(objKey(4), Buffer.from(`BT /F1 24 Tf 72 700 Td (${text}) Tj ET`, 'latin1'));

  let pdf = Buffer.from('%PDF-1.4\n', 'latin1');
  const off: number[] = [];
  const add = (b: Buffer) => {
    off.push(pdf.length);
    pdf = Buffer.concat([pdf, b]);
  };
  const str = (s: string) => Buffer.from(s, 'latin1');
  add(str('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'));
  add(str('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'));
  add(str('3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n'));
  add(Buffer.concat([str(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`), content, str('\nendstream\nendobj\n')]));
  add(str('5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'));
  const hex = (b: Buffer) => `<${b.toString('hex')}>`;
  const length = withLength ? ' /Length 40' : '';
  add(str(`6 0 obj\n<< /Filter /Standard /V 1 /R 2${length} /O ${hex(O)} /U ${hex(U)} /P ${P} >>\nendobj\n`));
  const xref = pdf.length;
  const tail =
    `xref\n0 7\n0000000000 65535 f \n` +
    off.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('') +
    `trailer\n<< /Size 7 /Root 1 0 R /Encrypt 6 0 R /ID [${hex(id)} ${hex(id)}] >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.concat([pdf, str(tail)]));
}
