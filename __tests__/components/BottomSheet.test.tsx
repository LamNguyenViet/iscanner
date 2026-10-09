import { Platform, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { BottomSheet, IOS_DISMISS_FALLBACK_MS } from '../../src/components/BottomSheet';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 34, left: 0 }),
}));

function sheet(visible: boolean, onClosed: () => void, onClose = jest.fn()) {
  return (
    <BottomSheet visible={visible} title="T" closeLabel="Close" onClose={onClose} onClosed={onClosed}>
      <Text>Body</Text>
    </BottomSheet>
  );
}

/** The host Modal, found from a node inside it. */
const modalHost = () => {
  let node = screen.getByText('Body').parent;
  while (node && node.props.onRequestClose === undefined) node = node.parent;
  return node!;
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('Android: onClosed runs right after the sheet closes', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onClosed = jest.fn();
  await render(sheet(true, onClosed));
  expect(onClosed).not.toHaveBeenCalled();
  await screen.rerender(sheet(false, onClosed));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('iOS: onClosed waits for the Modal to finish dismissing', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const onClosed = jest.fn();
  await render(sheet(true, onClosed));
  // Wired to the native dismissal callback.
  expect(typeof modalHost().props.onDismiss).toBe('function');
  const onDismiss = modalHost().props.onDismiss;
  jest.useFakeTimers();
  await screen.rerender(sheet(false, onClosed));
  await act(async () => {
    jest.advanceTimersByTime(IOS_DISMISS_FALLBACK_MS - 1);
  });
  expect(onClosed).not.toHaveBeenCalled();
  await act(async () => {
    onDismiss();
  });
  expect(onClosed).toHaveBeenCalledTimes(1);
  // The fallback timer does not fire a second time.
  await act(async () => {
    jest.advanceTimersByTime(IOS_DISMISS_FALLBACK_MS);
  });
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('iOS: the fallback timer runs onClosed if the dismissal callback never comes', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const onClosed = jest.fn();
  await render(sheet(true, onClosed));
  jest.useFakeTimers();
  await screen.rerender(sheet(false, onClosed));
  await act(async () => {
    jest.advanceTimersByTime(IOS_DISMISS_FALLBACK_MS);
  });
  expect(onClosed).toHaveBeenCalledTimes(1);
});

test('onClosed is not called for a sheet that was never open', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const onClosed = jest.fn();
  await render(sheet(false, onClosed));
  await screen.rerender(sheet(false, onClosed));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  expect(onClosed).not.toHaveBeenCalled();
});

test('the backdrop closes the sheet, and the sheet is modal for screen readers', async () => {
  const onClose = jest.fn();
  await render(sheet(true, jest.fn(), onClose));
  // The backdrop is outside the modal view, so screen readers skip it (VoiceOver uses escape).
  await fireEvent.press(screen.getByLabelText('Close', { includeHiddenElements: true }));
  expect(onClose).toHaveBeenCalledTimes(1);
  await fireEvent(screen.getByText('Body').parent!, 'accessibilityEscape');
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Body').parent!.props.accessibilityViewIsModal).toBe(true);
  expect(modalHost().props.statusBarTranslucent).toBe(true);
});
