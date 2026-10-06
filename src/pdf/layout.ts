export type PageSize = 'a4' | 'letter' | 'image';
export type Margin = 'none' | 'small' | 'medium';
export type Align = 'top' | 'center' | 'bottom' | 'fill';
export type PageLayout = { pageSize: PageSize; margin: Margin };

export const DEFAULT_LAYOUT: PageLayout = { pageSize: 'a4', margin: 'medium' };

export type Placement = {
  pageWidth: number;
  pageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

// PDF points.
const PAGE_POINTS = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
} as const;
const MARGIN_POINTS: Record<Margin, number> = { none: 0, small: 14.17, medium: 28.35 };

export function computePlacement(
  img: { width: number; height: number },
  layout: PageLayout,
  align: Align,
): Placement {
  if (layout.pageSize === 'image') {
    return { pageWidth: img.width, pageHeight: img.height, x: 0, y: 0, width: img.width, height: img.height };
  }
  const base = PAGE_POINTS[layout.pageSize];
  const landscape = img.width > img.height;
  const pageWidth = landscape ? base.height : base.width;
  const pageHeight = landscape ? base.width : base.height;

  if (align === 'fill') {
    const scale = Math.max(pageWidth / img.width, pageHeight / img.height);
    const width = img.width * scale;
    const height = img.height * scale;
    return { pageWidth, pageHeight, x: (pageWidth - width) / 2, y: (pageHeight - height) / 2, width, height };
  }

  const margin = MARGIN_POINTS[layout.margin];
  const scale = Math.min((pageWidth - 2 * margin) / img.width, (pageHeight - 2 * margin) / img.height);
  const width = img.width * scale;
  const height = img.height * scale;
  const x = (pageWidth - width) / 2;
  const y =
    align === 'top'
      ? pageHeight - margin - height
      : align === 'bottom'
        ? margin
        : (pageHeight - height) / 2;
  return { pageWidth, pageHeight, x, y, width, height };
}
