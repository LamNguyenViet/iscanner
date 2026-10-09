/** `password` is kept in memory only (never persisted or logged). */
export type IncomingFile = { uri: string; name: string; kind: 'pdf' | 'image' | 'word'; size: number; password?: string };

export type IncomingPlan =
  | { kind: 'none' }
  | { kind: 'single-pdf'; pdf: IncomingFile; images: IncomingFile[] }
  | { kind: 'merge'; pdfs: IncomingFile[]; images: IncomingFile[] }
  | { kind: 'scan'; images: IncomingFile[] };
