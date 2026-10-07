import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { stripComments } from '../i18n/vietnameseGuard';

const ROOT = join(__dirname, '..', '..');
const CONSOLE_CALL = /\bconsole\.(log|warn|error|info|debug)\b/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path === join(ROOT, 'src', 'logging')) continue;
      out.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

test('no console.* call in app/ or src/ outside src/logging/', () => {
  const offenders: string[] = [];
  for (const file of [...sourceFiles(join(ROOT, 'app')), ...sourceFiles(join(ROOT, 'src'))]) {
    stripComments(readFileSync(file, 'utf8'))
      .split('\n')
      .forEach((line, i) => {
        if (CONSOLE_CALL.test(line)) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}`);
      });
  }
  expect(offenders).toEqual([]);
});
