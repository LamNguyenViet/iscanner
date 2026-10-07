import { AppState, type AppStateStatus } from 'react-native';
import { act, render } from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
import { hasSharedFiles } from '../../src/native/sharedPayloads';

const mockNavigate = jest.fn();
let mockPathname = '/';
jest.mock('expo-router', () => {
  const Stack = () => null;
  Stack.Screen = () => null;
  return {
    Stack,
    router: { navigate: (...args: unknown[]) => mockNavigate(...args) },
    usePathname: () => mockPathname,
    ThemeProvider: ({ value, children }: { value: unknown; children: React.ReactNode }) => {
      mockNavTheme = value;
      return children;
    },
    DefaultTheme: { dark: false, colors: { notification: 'n' } },
    DarkTheme: { dark: true, colors: { notification: 'n' } },
  };
});
let mockNavTheme: unknown;
const mockStatusBar = jest.fn();
jest.mock('expo-status-bar', () => ({
  StatusBar: (props: unknown) => {
    mockStatusBar(props);
    return null;
  },
}));
jest.mock('../../src/theme/preference', () => ({
  ...jest.requireActual('../../src/theme/preference'),
  loadPreference: () => Promise.resolve('system'),
  savePreference: () => Promise.resolve(),
}));
let mockColorScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));
jest.mock('../../src/library/LibraryContext', () => ({
  LibraryProvider: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../src/native/sharedPayloads', () => ({ hasSharedFiles: jest.fn() }));
const mockHasShared = hasSharedFiles as jest.Mock;

let appStateHandler: ((s: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/';
  mockColorScheme = 'light';
  mockHasShared.mockReturnValue(false);
  appStateHandler = undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    appStateHandler = h as (s: AppStateStatus) => void;
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

test('a share waiting at startup opens the incoming screen', async () => {
  mockHasShared.mockReturnValue(true);
  await render(<RootLayout />);
  expect(mockNavigate).toHaveBeenCalledWith('/incoming');
});

test('a share received while in the background opens the incoming screen on return', async () => {
  await render(<RootLayout />);
  expect(mockNavigate).not.toHaveBeenCalled();
  mockHasShared.mockReturnValue(true);
  await act(async () => appStateHandler!('active'));
  expect(mockNavigate).toHaveBeenCalledWith('/incoming');
});

test('does nothing when no share is waiting', async () => {
  await render(<RootLayout />);
  await act(async () => appStateHandler!('active'));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('leaves it to the incoming screen when that screen is already open', async () => {
  mockPathname = '/incoming';
  mockHasShared.mockReturnValue(true);
  await render(<RootLayout />);
  await act(async () => appStateHandler!('active'));
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('the status bar follows the theme', async () => {
  await render(<RootLayout />);
  expect(mockStatusBar).toHaveBeenCalledWith(expect.objectContaining({ style: 'auto' }));
});

test('navigation headers use the dark palette in dark mode', async () => {
  mockColorScheme = 'dark';
  await render(<RootLayout />);
  expect(mockNavTheme).toMatchObject({
    dark: true,
    colors: { background: '#121212', card: '#1e1e1e', text: '#e8e8e8', primary: '#4c8dff', border: '#333', notification: 'n' },
  });
});
