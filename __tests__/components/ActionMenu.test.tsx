import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ActionMenu } from '../../src/components/ActionMenu';

function setup() {
  const onClose = jest.fn();
  const onLight = jest.fn();
  const onDelete = jest.fn();
  return {
    onClose,
    onLight,
    onDelete,
    ui: (
      <ActionMenu
        visible
        title="Giao diện"
        onClose={onClose}
        items={[
          { label: 'Sáng', onPress: onLight, selected: true },
          { label: 'Xoá', onPress: onDelete, destructive: true },
        ]}
      />
    ),
  };
}

test('renders the title and items, marking the selected one', async () => {
  await render(setup().ui);
  expect(screen.getByText('Giao diện')).toBeTruthy();
  expect(screen.getByText('✓ Sáng')).toBeTruthy();
  expect(screen.getByText('Xoá')).toBeTruthy();
});

test('pressing an item calls its handler', async () => {
  const s = setup();
  await render(s.ui);
  await fireEvent.press(screen.getByText('Xoá'));
  expect(s.onDelete).toHaveBeenCalled();
});

test('the backdrop and the back button close the menu', async () => {
  const s = setup();
  await render(s.ui);
  await fireEvent.press(screen.getByLabelText('Đóng menu'));
  expect(s.onClose).toHaveBeenCalledTimes(1);
  // Hardware back on Android: the host Modal's onRequestClose.
  let modal = screen.getByText('Giao diện').parent;
  while (modal && !modal.props.onRequestClose) modal = modal.parent;
  await fireEvent(modal!, 'requestClose');
  expect(s.onClose).toHaveBeenCalledTimes(2);
});

test('destructive items use the danger color', async () => {
  await render(setup().ui);
  expect(StyleSheet.flatten(screen.getByText('Xoá').props.style).color).toBe('#d1242f');
});
