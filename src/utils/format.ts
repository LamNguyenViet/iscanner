/**
 * Format an ISO date string to dd/MM/yyyy HH:mm in local time
 */
export function formatDate(iso: string): string {
  const date = new Date(iso);

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Generate a default name for a scan or merge based on date
 * Format: "Scan 05-10-2026 14.03" or "Gộp 05-10-2026 14.03"
 */
export function defaultName(kind: 'scan' | 'merge', date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  const prefix = kind === 'scan' ? 'Scan' : 'Gộp';

  return `${prefix} ${day}-${month}-${year} ${hours}.${minutes}`;
}

/**
 * Format bytes as a human-readable size string
 * Returns "512 B", "1.5 KB", "2.3 MB", etc. using 1024 base
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }

  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/**
 * Sanitize a name by trimming whitespace and truncating to 100 characters
 * Returns fallback if input is empty after trimming
 */
export function sanitizeName(input: string, fallback: string): string {
  const trimmed = input.trim();

  if (trimmed === '') {
    return fallback;
  }

  return trimmed.substring(0, 100);
}

const SHARE_NAME_FALLBACK = 'tai-lieu';

/**
 * File name used when sharing a document: the document name made safe for file systems
 * (reserved characters → "-", whitespace collapsed, trailing dots removed, max 100 chars) + ".pdf"
 */
export function shareFileName(name: string): string {
  const base = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, (ch) => (/\s/.test(ch) ? ' ' : '-'))
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '')
    .substring(0, 100)
    .trim();
  return `${base || SHARE_NAME_FALLBACK}.pdf`;
}
