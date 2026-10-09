import { Buffer } from 'buffer';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { A4_PAGE, type PageSetup } from './types';

// word-extractor ships no types. Its main entry pulls in yauzl/zlib (DOCX support), so import
// the OLE extractor and buffer reader directly; this exact path runs on Hermes.
type WordDocumentBody = { getBody(): string };
type OleExtractor = { extract(reader: unknown): Promise<WordDocumentBody> };
const WordOleExtractor: new () => OleExtractor = require('word-extractor/lib/word-ole-extractor');
const BufferReader: new (buffer: Buffer) => unknown = require('word-extractor/lib/buffer-reader');

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TWIP = 20;

function twipAttr(tag: string, name: string): number | null {
  const m = new RegExp(`\\bw:${name}\\s*=\\s*"(-?\\d+(?:\\.\\d+)?)"`).exec(tag);
  return m ? Number(m[1]) : null;
}

/** Page size and margins from the first w:sectPr, in points; A4 when absent or invalid. */
export async function readDocxPageSetup(bytes: Uint8Array): Promise<PageSetup> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) return A4_PAGE;
    const sect = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/.exec(xml);
    if (!sect) return A4_PAGE;
    const pgSz = /<w:pgSz\b[^>]*>/.exec(sect[0]);
    if (!pgSz) return A4_PAGE;
    const w = twipAttr(pgSz[0], 'w');
    const h = twipAttr(pgSz[0], 'h');
    if (w === null || h === null || !(w > 0) || !(h > 0)) return A4_PAGE;
    const pgMar = /<w:pgMar\b[^>]*>/.exec(sect[0])?.[0] ?? '';
    const m = (name: string, fallback: number): number => {
      const v = twipAttr(pgMar, name);
      return v === null || v < 0 ? fallback : v / TWIP;
    };
    return {
      width: w / TWIP,
      height: h / TWIP,
      margin: {
        top: m('top', A4_PAGE.margin.top),
        right: m('right', A4_PAGE.margin.right),
        bottom: m('bottom', A4_PAGE.margin.bottom),
        left: m('left', A4_PAGE.margin.left),
      },
    };
  } catch {
    return A4_PAGE;
  }
}

const num = (n: number): string => String(Math.round(n * 100) / 100);

function wrapHtml(body: string, page: PageSetup): string {
  const { top, right, bottom, left } = page.margin;
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>' +
    `@page { size: ${num(page.width)}pt ${num(page.height)}pt; margin: ${num(top)}pt ${num(right)}pt ${num(bottom)}pt ${num(left)}pt; }` +
    ' body { font-family: sans-serif; font-size: 11pt; line-height: 1.4; margin: 0; }' +
    ' img { max-width: 100%; }' +
    ' table { border-collapse: collapse; }' +
    ' td, th { border: 1px solid #000; padding: 2pt 4pt; }' +
    '</style></head><body>' +
    body +
    '</body></html>'
  );
}

export async function docxToHtml(bytes: Uint8Array): Promise<{ html: string; page: PageSetup }> {
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const [page, result] = await Promise.all([
    readDocxPageSetup(bytes),
    // Metro resolves mammoth's browser build (reads `arrayBuffer`); Node/Jest resolves the
    // Node build (reads `buffer`). Both take the same ArrayBuffer.
    mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer } as { arrayBuffer: ArrayBuffer }, {
      convertImage: mammoth.images.dataUri,
    }),
  ]);
  return { html: wrapHtml(result.value, page), page };
}

export async function docToHtml(bytes: Uint8Array): Promise<{ html: string; page: PageSetup }> {
  const doc = await new WordOleExtractor().extract(new BufferReader(Buffer.from(bytes)));
  const body = doc
    .getBody()
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('');
  return { html: wrapHtml(body, A4_PAGE), page: A4_PAGE };
}
