import { Appearance, Pressable, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { createMemoryFs } from '../../src/library/memoryFs';
import { ThemeProvider, useTheme } from '../../src/theme/ThemeContext';
import type { ThemePreference } from '../../src/settings/settings';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));
const mockScheme = jest.requireMock('react-native/Libraries/Utilities/useColorScheme').default as jest.Mock;

function Probe({ next }: { next?: ThemePreference }) {
  const { scheme, preference, colors, setPreference } = useTheme();
  return (
    <>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="preference">{preference}</Text>
      <Text testID="background">{colors.background}</Text>
      {next && (
        <Pressable accessibilityRole="button" onPress={() => setPreference(next)}>
          <Text>choose</Text>
        </Pressable>
      )}
    </>
  );
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const text = (id: string) => screen.getByTestId(id).props.children;

let setScheme: jest.SpyInstance;
beforeEach(() => {
  mockScheme.mockReturnValue('light');
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('applies the saved preference at startup', async () => {
  const fs = createMemoryFs();
  fs.files.set('settings.json', '{"theme":"dark"}');
  await render(
    <ThemeProvider fs={fs}>
      <Probe />
    </ThemeProvider>,
  );
  await settle();
  expect(setScheme).toHaveBeenCalledWith('dark');
  expect(text('preference')).toBe('dark');
});

test('follows the system when nothing is saved', async () => {
  await render(
    <ThemeProvider fs={createMemoryFs()}>
      <Probe />
    </ThemeProvider>,
  );
  await settle();
  expect(setScheme).toHaveBeenCalledWith('unspecified');
  expect(text('preference')).toBe('system');
});

test('setPreference applies the scheme and saves it', async () => {
  const fs = createMemoryFs();
  await render(
    <ThemeProvider fs={fs}>
      <Probe next="light" />
    </ThemeProvider>,
  );
  await settle();
  await fireEvent.press(screen.getByRole('button'));
  await settle();
  expect(setScheme).toHaveBeenLastCalledWith('light');
  expect(text('preference')).toBe('light');
  expect(JSON.parse(fs.files.get('settings.json') as string)).toEqual({ theme: 'light', language: 'system' });
});

test('a failed save still applies the theme', async () => {
  const fs = createMemoryFs();
  await render(
    <ThemeProvider fs={fs}>
      <Probe next="dark" />
    </ThemeProvider>,
  );
  await settle();
  fs.failNextWrite('settings.json');
  await fireEvent.press(screen.getByRole('button'));
  await settle();
  expect(setScheme).toHaveBeenLastCalledWith('dark');
  expect(text('preference')).toBe('dark');
  expect(fs.files.has('settings.json')).toBe(false);
});

test('colors follow the effective scheme live', async () => {
  mockScheme.mockReturnValue('dark');
  const ui = () => (
    <ThemeProvider fs={createMemoryFs()}>
      <Probe />
    </ThemeProvider>
  );
  await render(ui());
  await settle();
  expect(text('scheme')).toBe('dark');
  expect(text('background')).toBe('#121212');
  mockScheme.mockReturnValue('light');
  await screen.rerender(ui());
  expect(text('background')).toBe('#fff');
});

test('an unknown scheme counts as light', async () => {
  mockScheme.mockReturnValue(null);
  await render(
    <ThemeProvider fs={createMemoryFs()}>
      <Probe />
    </ThemeProvider>,
  );
  await settle();
  expect(text('scheme')).toBe('light');
});

test('without a provider useTheme returns the light defaults', async () => {
  mockScheme.mockReturnValue('dark');
  await render(<Probe />);
  expect(text('scheme')).toBe('light');
  expect(text('preference')).toBe('system');
  expect(text('background')).toBe('#fff');
});
