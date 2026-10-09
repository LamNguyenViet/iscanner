import { useEffect } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { usePasswordPrompt } from '../../src/components/PasswordPrompt';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';

let mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

type Ask = ReturnType<typeof usePasswordPrompt>['ask'];
let ask: Ask;

function Probe() {
  const p = usePasswordPrompt();
  useEffect(() => {
    ask = p.ask;
  });
  return (
    <>
      <Text>probe</Text>
      {p.element}
    </>
  );
}

async function mount() {
  await render(
    <LocaleProvider fs={createMemoryFs()}>
      <Probe />
    </LocaleProvider>,
  );
  await settle();
}

/** Starts an ask and tracks its result. */
async function start(file = 'a.pdf', wrong = false) {
  const result: { value?: string | null; done: boolean } = { done: false };
  await act(async () => {
    ask(file, wrong).then((v) => {
      result.value = v;
      result.done = true;
    });
  });
  return result;
}

beforeEach(() => {
  mockLocales = [{ languageCode: 'vi', languageTag: 'vi-VN' }];
});

test('shows the vi copy with the file name and a masked input', async () => {
  await mount();
  await start('hoso.pdf');
  expect(screen.getByText('Nhập mật khẩu')).toBeTruthy();
  expect(screen.getByText('"hoso.pdf" được bảo vệ bằng mật khẩu.')).toBeTruthy();
  const input = screen.getByPlaceholderText('Mật khẩu');
  expect(input.props.secureTextEntry).toBe(true);
  expect(input.props.autoCapitalize).toBe('none');
  expect(input.props.autoCorrect).toBe(false);
  expect(input.props.textContentType).toBe('password');
  expect(screen.getByLabelText('Mật khẩu')).toBeTruthy();
  expect(screen.queryByText('Mật khẩu không đúng, vui lòng thử lại.')).toBeNull();
});

test('Open is disabled while the input is empty and does nothing', async () => {
  await mount();
  const r = await start();
  const open = screen.getByRole('button', { name: 'Mở' });
  expect(open.props.accessibilityState?.disabled ?? open.props['aria-disabled']).toBeTruthy();
  await fireEvent.press(screen.getByText('Mở'));
  await settle();
  expect(r.done).toBe(false);
});

test('typing and pressing Open resolves the password untrimmed', async () => {
  await mount();
  const r = await start();
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), ' secret ');
  await fireEvent.press(screen.getByText('Mở'));
  await settle();
  expect(r).toEqual({ done: true, value: ' secret ' });
});

test('wrongBefore shows the wrong line', async () => {
  await mount();
  await start('a.pdf', true);
  expect(screen.getByText('Mật khẩu không đúng, vui lòng thử lại.')).toBeTruthy();
});

test('Skip resolves null', async () => {
  await mount();
  const r = await start();
  await fireEvent.press(screen.getByText('Bỏ qua file này'));
  await settle();
  expect(r).toEqual({ done: true, value: null });
});

test('the back button (Modal onRequestClose) resolves null', async () => {
  await mount();
  const r = await start();
  let node = screen.getByText('Nhập mật khẩu').parent;
  while (node && !node.props.onRequestClose) node = node.parent;
  await fireEvent(node!, 'requestClose');
  await settle();
  expect(r).toEqual({ done: true, value: null });
});

test('keyboard submit opens with the text', async () => {
  await mount();
  const r = await start();
  const input = screen.getByPlaceholderText('Mật khẩu');
  await fireEvent.changeText(input, 'pw1');
  await fireEvent(input, 'submitEditing');
  await settle();
  expect(r).toEqual({ done: true, value: 'pw1' });
});

test('keyboard submit with an empty input does nothing', async () => {
  await mount();
  const r = await start();
  await fireEvent(screen.getByPlaceholderText('Mật khẩu'), 'submitEditing');
  await settle();
  expect(r.done).toBe(false);
  expect(screen.getByText('Nhập mật khẩu')).toBeTruthy();
});

test('a new ask resolves the previous one null and clears the input', async () => {
  await mount();
  const first = await start('a.pdf');
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), 'old');
  const second = await start('b.pdf');
  await settle();
  expect(first).toEqual({ done: true, value: null });
  expect(second.done).toBe(false);
  expect(screen.getByPlaceholderText('Mật khẩu').props.value).toBe('');
  expect(screen.getByText('"b.pdf" được bảo vệ bằng mật khẩu.')).toBeTruthy();
});

test('the input is cleared for each ask after a submit', async () => {
  await mount();
  await start();
  await fireEvent.changeText(screen.getByPlaceholderText('Mật khẩu'), 'one');
  await fireEvent.press(screen.getByText('Mở'));
  await settle();
  await start();
  expect(screen.getByPlaceholderText('Mật khẩu').props.value).toBe('');
});

test('unmounting while pending resolves null', async () => {
  await mount();
  const r = await start();
  await screen.unmount();
  await settle();
  expect(r).toEqual({ done: true, value: null });
});

test('ask after unmount resolves null at once', async () => {
  await mount();
  await screen.unmount();
  await expect(ask('late.pdf', false)).resolves.toBeNull();
});

test('shows the en copy under an en LocaleProvider', async () => {
  mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
  await mount();
  await start('x.pdf', true);
  expect(screen.getByText('Enter password')).toBeTruthy();
  expect(screen.getByText('"x.pdf" is password-protected.')).toBeTruthy();
  expect(screen.getByText('Wrong password, please try again.')).toBeTruthy();
  expect(screen.getByText('Skip this file')).toBeTruthy();
  expect(screen.getByText('Open')).toBeTruthy();
  expect(screen.getByPlaceholderText('Password')).toBeTruthy();
});
