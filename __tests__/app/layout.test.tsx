import { AppState, type AppStateStatus } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import RootLayout from '../../app/_layout';
import { hasSharedFiles } from '../../src/native/sharedPayloads';
import { installGlobalHandlers } from '../../src/logging/globalHandlers';
import { log } from '../../src/logging/logger';

const mockNavigate = jest.fn();
const mockPush = jest.fn();
const mockScreens: Record<string, any> = {};
let mockPathname = '/';
jest.mock('expo-router', () => {
  const Stack = ({ children }: { children: React.ReactNode }) => children;
  Stack.Screen = (props: { name: string }) => {
    mockScreens[props.name] = props;
    return null;
  };
  return {
    Stack,
    router: {
      navigate: (...args: unknown[]) => mockNavigate(...args),
      push: (...args: unknown[]) => mockPush(...args),
    },
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
jest.mock('../../src/settings/settings', () => ({
  ...jest.requireActual('../../src/settings/settings'),
  loadSettings: () => mockLoad(),
  saveSettings: () => Promise.resolve(),
}));
let mockLoad: () => Promise<unknown> = () => Promise.resolve({ theme: 'system', language: 'system' });
let mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));
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

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.6.0' } } }));
jest.mock('../../src/logging/globalHandlers', () => ({ installGlobalHandlers: jest.fn(() => jest.fn()) }));

let appStateHandler: ((s: AppStateStatus) => void) | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockScreens)) delete mockScreens[k];
  mockLoad = () => Promise.resolve({ theme: 'system', language: 'system' });
  mockPathname = '/';
  mockColorScheme = 'light';
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
  mockHasShared.mockReturnValue(false);
  const handlers: ((s: AppStateStatus) => void)[] = [];
  appStateHandler = (s) => handlers.forEach((h) => h(s));
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, h) => {
    handlers.push(h as (s: AppStateStatus) => void);
    return { remove: jest.fn() } as unknown as ReturnType<typeof AppState.addEventListener>;
  });
});

test('a share waiting at startup opens the incoming screen', async () => {
  mockHasShared.mockReturnValue(true);
  await render(<RootLayout />);
  expect(mockNavigate).toHaveBeenCalledWith('/incoming');
});

test('a waiting share is opened only once the navigator has mounted', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  mockLoad = () => gate.then(() => ({ theme: 'system', language: 'system' }));
  mockHasShared.mockReturnValue(true);
  await render(<RootLayout />);
  expect(mockScreens.index).toBeUndefined();
  expect(mockNavigate).not.toHaveBeenCalled();
  await act(async () => release());
  expect(mockScreens.index).toBeDefined();
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

test('the library header has a settings button that opens the settings screen', async () => {
  await render(<RootLayout />);
  const headerRight = mockScreens.index.options.headerRight;
  await render(headerRight());
  await fireEvent.press(screen.getByLabelText('Cài đặt'));
  expect(mockPush).toHaveBeenCalledWith('/settings');
});

test('screen titles follow the language', async () => {
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  await render(<RootLayout />);
  expect(mockScreens.merge.options.title).toBe('Merge PDF');
});

test('screen titles are Vietnamese on a Vietnamese device', async () => {
  await render(<RootLayout />);
  expect(mockScreens.merge.options.title).toBe('Gộp PDF');
  expect(mockScreens.settings.options.title).toBe('Cài đặt');
});

test('initializes the log once, records app.start and installs the global handlers', async () => {
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  await render(<RootLayout />);
  expect(log.init).toHaveBeenCalledWith({ app: '1.6.0', os: expect.any(String) });
  expect(log.info).toHaveBeenCalledWith('app.start', { language: 'en', theme: 'system' });
  expect(installGlobalHandlers).toHaveBeenCalledTimes(1);
  expect(installGlobalHandlers).toHaveBeenCalledWith(log);
});

test('flushes the log when the app goes to the background or becomes inactive', async () => {
  await render(<RootLayout />);
  await act(async () => appStateHandler!('active'));
  expect(log.flush).not.toHaveBeenCalled();
  await act(async () => appStateHandler!('background'));
  expect(log.flush).toHaveBeenCalledTimes(1);
  await act(async () => appStateHandler!('inactive'));
  expect(log.flush).toHaveBeenCalledTimes(2);
});
