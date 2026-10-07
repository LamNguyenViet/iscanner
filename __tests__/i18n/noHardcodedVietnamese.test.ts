import fs from 'fs';
import path from 'path';
import { stripComments, vietnameseLines } from './vietnameseGuard';

const ROOT = path.resolve(__dirname, '..', '..');
const I18N_DIR = path.join(ROOT, 'src', 'i18n');

// Entries are `relative/path.ts:line`. Add one only with a comment explaining why.
const ALLOWLIST: string[] = [];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === I18N_DIR ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('no hard-coded Vietnamese outside src/i18n', () => {
  it('has no Vietnamese text in app/ or src/ (outside comments)', () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles(path.join(ROOT, 'app')), ...sourceFiles(path.join(ROOT, 'src'))]) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/');
      const source = fs.readFileSync(file, 'utf8');
      const lines = stripComments(source).split(/\r?\n/);
      for (const n of vietnameseLines(source)) {
        const where = `${rel}:${n}`;
        if (!ALLOWLIST.includes(where)) offenders.push(`${where}  ${lines[n - 1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
