export type IncomingFile = { uri: string; name: string; kind: 'pdf' | 'image'; size: number };

export type IncomingPlan =
  | { kind: 'none' }
  | { kind: 'single-pdf'; pdf: IncomingFile; images: IncomingFile[] }
  | { kind: 'merge'; pdfs: IncomingFile[]; images: IncomingFile[] }
  | { kind: 'scan'; images: IncomingFile[] };
