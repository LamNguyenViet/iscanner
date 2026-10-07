import { darkPalette, lightPalette, paletteFor } from '../../src/theme/palette';

test('light and dark palettes define the same non-empty tokens', () => {
  expect(Object.keys(darkPalette).sort()).toEqual(Object.keys(lightPalette).sort());
  for (const value of [...Object.values(lightPalette), ...Object.values(darkPalette)]) {
    expect(typeof value).toBe('string');
    expect(value.length).toBeGreaterThan(0);
  }
});

test('palettes use the spec values', () => {
  expect(lightPalette).toMatchObject({ background: '#fff', primary: '#1f6feb', danger: '#d1242f' });
  expect(darkPalette).toMatchObject({
    background: '#121212',
    surface: '#1e1e1e',
    text: '#e8e8e8',
    primary: '#4c8dff',
  });
});

test('paletteFor picks the palette for a scheme', () => {
  expect(paletteFor('dark')).toBe(darkPalette);
  expect(paletteFor('light')).toBe(lightPalette);
});
