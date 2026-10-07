import type { FsAdapter } from '../library/types';
import { localIsoTimestamp } from './format';
import type { Logger } from './logger';
import { isLogFileName } from './retention';

export type ExportMeta = { app: string; os: string; language: string };

/** Bundle the daily log files into one text and hand it to `writeExport`; null when there are none. */
export async function exportLogs(deps: {
  fs: FsAdapter;
  logger: Pick<Logger, 'flush'>;
  now?: () => Date;
  meta: ExportMeta;
  writeExport: (name: string, text: string) => Promise<string>;
}): Promise<{ uri: string; files: number; bytes: number } | null> {
  const { fs, logger, meta, writeExport } = deps;
  const now = (deps.now ?? (() => new Date()))();
  await logger.flush();
  const names = (await fs.list('logs')).filter(isLogFileName).sort();
  if (names.length === 0) return null;

  let text = `iScanner ${meta.app} · ${meta.os} · ${meta.language} · ${localIsoTimestamp(now)}\n\n`;
  for (const name of names) {
    let content: string;
    try {
      content = (await fs.readText(`logs/${name}`)) ?? '';
    } catch (error) {
      content = `[unreadable: ${error instanceof Error ? error.name : 'Error'}]`;
    }
    text += `=== ${name} ===\n${content}${content === '' || content.endsWith('\n') ? '' : '\n'}`;
  }
  const uri = await writeExport(`iScanner-logs-${localIsoTimestamp(now).slice(0, 10)}.txt`, text);
  return { uri, files: names.length, bytes: text.length };
}
