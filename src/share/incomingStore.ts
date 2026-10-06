import type { IncomingFile } from './types';

let pending: { pdfs: IncomingFile[]; images: IncomingFile[] } = { pdfs: [], images: [] };

export function setPending(p: { pdfs: IncomingFile[]; images: IncomingFile[] }): IncomingFile[] {
  const dropped = [...pending.pdfs, ...pending.images];
  pending = { pdfs: [...p.pdfs], images: [...p.images] };
  return dropped;
}

export function takePdfs(): IncomingFile[] {
  const out = pending.pdfs;
  pending = { ...pending, pdfs: [] };
  return out;
}

export function takeImages(): IncomingFile[] {
  const out = pending.images;
  pending = { ...pending, images: [] };
  return out;
}

export function hasPendingImages(): boolean {
  return pending.images.length > 0;
}

export function clearPending(): IncomingFile[] {
  const dropped = [...pending.pdfs, ...pending.images];
  pending = { pdfs: [], images: [] };
  return dropped;
}
