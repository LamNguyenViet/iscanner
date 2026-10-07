export type Palette = {
  background: string;
  surface: string;
  surfaceActive: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  danger: string;
  backdrop: string;
  placeholder: string;
};

export const lightPalette: Palette = {
  background: '#fff',
  surface: '#fff',
  surfaceActive: '#eef4ff',
  text: '#1f1f1f',
  textMuted: '#666',
  border: '#ddd',
  primary: '#1f6feb',
  onPrimary: '#fff',
  danger: '#d1242f',
  backdrop: 'rgba(0,0,0,0.4)',
  placeholder: '#eee',
};

export const darkPalette: Palette = {
  background: '#121212',
  surface: '#1e1e1e',
  surfaceActive: '#1c2b45',
  text: '#e8e8e8',
  textMuted: '#a0a0a0',
  border: '#333',
  primary: '#4c8dff',
  onPrimary: '#fff',
  danger: '#ff6b6b',
  backdrop: 'rgba(0,0,0,0.6)',
  placeholder: '#2a2a2a',
};

export function paletteFor(scheme: 'light' | 'dark'): Palette {
  return scheme === 'dark' ? darkPalette : lightPalette;
}
