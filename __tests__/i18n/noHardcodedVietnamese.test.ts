import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const I18N_DIR = path.join(ROOT, 'src', 'i18n');
const VIETNAMESE =
  /['"`][^'"`]*[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;

// Entries are `relative/path.ts:line`. Add one only with a comment explaining why.
const ALLOWLIST: string[] = [];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === I18N_DIR ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

// Replaces comments with blanks of the same line structure so line numbers stay correct.
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('no hard-coded Vietnamese outside src/i18n', () => {
  it('has no Vietnamese string literals in app/ or src/', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))]) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      stripComments(fs.readFileSync(file, 'utf8')).split(/\r?\n/).forEach((line, i) => {
        const where = `${rel}:${i + 1}`;
        if (VIETNAMESE.test(line) && !ALLOWLIST.includes(where)) offenders.push(`${where}  ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
