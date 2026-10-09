import type { IncomingFile, IncomingPlan } from './types';

export function planIncoming(files: IncomingFile[]): IncomingPlan {
  const pdfs = files.filter((f) => f.kind === 'pdf' || f.kind === 'word');
  const images = files.filter((f) => f.kind === 'image');
  if (pdfs.length >= 2) return { kind: 'merge', pdfs, images };
  if (pdfs.length === 1) return { kind: 'single-pdf', pdf: pdfs[0], images };
  if (images.length > 0) return { kind: 'scan', images };
  return { kind: 'none' };
}
