import { ActionSheetIOS, Appearance, Platform } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeMenuButton } from '../../src/components/ThemeMenuButton';
import { createMemoryFs } from '../../src/library/memoryFs';
import { ThemeProvider } from '../../src/theme/ThemeContext';

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

async function renderButton() {
  await render(
    <ThemeProvider fs={createMemoryFs()}>
      <ThemeMenuButton />
    </ThemeProvider>,
  );
  await settle();
}

let setScheme: jest.SpyInstance;
beforeEach(() => {
  setScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

test('Android: menu marks the current choice and applies a new one', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await renderButton();
  await fireEvent.press(screen.getByLabelText('Giao diện'));
  expect(screen.getByText('✓ Theo hệ thống')).toBeTruthy();
  expect(screen.getByText('Sáng')).toBeTruthy();
  expect(screen.getByText('Huỷ')).toBeTruthy();
  await fireEvent.press(screen.getByText('Tối'));
  await settle();
  expect(setScheme).toHaveBeenLastCalledWith('dark');
  expect(screen.queryByText('Huỷ')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Giao diện'));
  expect(screen.getByText('✓ Tối')).toBeTruthy();
});

test('Android: Huỷ closes without changing the theme', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  await renderButton();
  setScheme.mockClear();
  await fireEvent.press(screen.getByLabelText('Giao diện'));
  await fireEvent.press(screen.getByText('Huỷ'));
  expect(screen.queryByText('Huỷ')).toBeNull();
  expect(setScheme).not.toHaveBeenCalled();
});

test('iOS: uses the action sheet', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const sheet = jest
    .spyOn(ActionSheetIOS, 'showActionSheetWithOptions')
    .mockImplementation(() => {});
  await renderButton();
  await fireEvent.press(screen.getByLabelText('Giao diện'));
  expect(sheet).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'Giao diện',
      options: ['✓ Theo hệ thống', 'Sáng', 'Tối', 'Huỷ'],
      cancelButtonIndex: 3,
    }),
    expect.any(Function),
  );
  await act(async () => sheet.mock.calls[0][1](2));
  expect(setScheme).toHaveBeenLastCalledWith('dark');
});
