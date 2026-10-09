/** Page geometry in points (1/72 inch). */
export type PageSetup = {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
};

export const A4_PAGE: PageSetup = {
  width: 595.28,
  height: 841.89,
  margin: { top: 56.69, right: 56.69, bottom: 56.69, left: 56.69 },
};

export type WordKind = 'docx' | 'docx-encrypted' | 'doc';
