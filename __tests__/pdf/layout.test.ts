import { computePlacement, DEFAULT_LAYOUT } from '../../src/pdf/layout';

const A4_W = 595.28;
const A4_H = 841.89;
const MEDIUM = 28.35;

describe('computePlacement', () => {
  it('image mode keeps pixel page', () => {
    expect(
      computePlacement({ width: 800, height: 600 }, { pageSize: 'image', margin: 'medium' }, 'center'),
    ).toEqual({ pageWidth: 800, pageHeight: 600, x: 0, y: 0, width: 800, height: 600 });
  });

  it('A4 portrait fit centre with medium margin', () => {
    const p = computePlacement({ width: 1000, height: 2000 }, { pageSize: 'a4', margin: 'medium' }, 'center');
    expect(p.pageWidth).toBeCloseTo(A4_W, 1);
    expect(p.pageHeight).toBeCloseTo(A4_H, 1);
    expect(p.width).toBeCloseTo(392.6, 1);
    expect(p.height).toBeCloseTo(785.19, 1);
    expect(p.x).toBeCloseTo((A4_W - 392.6) / 2, 1);
    expect(p.y).toBeCloseTo(MEDIUM, 1);
  });

  it('landscape image gets landscape page', () => {
    const p = computePlacement({ width: 2000, height: 1000 }, { pageSize: 'a4', margin: 'none' }, 'center');
    expect(p.pageWidth).toBeCloseTo(A4_H, 1);
    expect(p.pageHeight).toBeCloseTo(A4_W, 1);
  });

  it('top and bottom alignment', () => {
    const layout = { pageSize: 'a4', margin: 'medium' } as const;
    const top = computePlacement({ width: 1000, height: 1100 }, layout, 'top');
    expect(top.y + top.height).toBeCloseTo(A4_H - MEDIUM, 1);
    const bottom = computePlacement({ width: 1000, height: 1100 }, layout, 'bottom');
    expect(bottom.y).toBeCloseTo(MEDIUM, 1);
  });

  it('small image is scaled up to fit', () => {
    const p = computePlacement({ width: 100, height: 100 }, { pageSize: 'letter', margin: 'small' }, 'center');
    expect(p.width).toBeCloseTo(612 - 2 * 14.17, 1);
    expect(p.height).toBeCloseTo(612 - 2 * 14.17, 1);
  });

  it('fill covers page ignoring margins', () => {
    const p = computePlacement({ width: 1000, height: 1000 }, { pageSize: 'a4', margin: 'medium' }, 'fill');
    expect(p.width).toBeCloseTo(A4_H, 1);
    expect(p.height).toBeCloseTo(A4_H, 1);
    expect(p.x).toBeCloseTo((A4_W - A4_H) / 2, 1);
    expect(p.y).toBeCloseTo(0, 1);
  });

  it('DEFAULT_LAYOUT is A4 medium', () => {
    expect(DEFAULT_LAYOUT).toEqual({ pageSize: 'a4', margin: 'medium' });
  });
});
