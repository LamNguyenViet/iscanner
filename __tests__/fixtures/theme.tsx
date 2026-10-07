import type { ReactElement } from 'react';
import { Appearance, StyleSheet } from 'react-native';
import { act } from '@testing-library/react-native';
import { createMemoryFs } from '../../src/library/memoryFs';
import { ThemeProvider } from '../../src/theme/ThemeContext';

/**
 * Wraps a screen in the app theme. The test file decides the scheme by mocking
 * 'react-native/Libraries/Utilities/useColorScheme' (see mockColorScheme below).
 */
export function themed(ui: ReactElement) {
  jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  return <ThemeProvider fs={createMemoryFs()}>{ui}</ThemeProvider>;
}

/** Lets the provider's preference load settle. */
export const settleTheme = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export const styleOf = (node: { props: { style?: unknown } }) =>
  StyleSheet.flatten(node.props.style as never) ?? {};
