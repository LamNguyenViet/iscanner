import { render, screen } from '@testing-library/react-native';
import { LocaleProvider } from '../../src/i18n/LocaleContext';
import { createMemoryFs } from '../../src/library/memoryFs';
import { DocumentRow } from '../../src/components/DocumentRow';
import { NameInput } from '../../src/components/NameInput';
import { SegmentedControl } from '../../src/components/SegmentedControl';
import { settleTheme, styleOf, themed } from '../fixtures/theme';

let mockLocales = [{ languageCode: 'en', languageTag: 'en-US' }];
jest.mock('expo-localization', () => ({ useLocales: () => mockLocales }));

let mockColorScheme = 'dark';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}));

beforeEach(() => {
  mockColorScheme = 'dark';
});
afterEach(() => {
  jest.restoreAllMocks();
});

const doc = {
  id: 'a',
  name: 'Hoa don',
  createdAt: '2026-10-07T00:00:00.000Z',
  pageCount: 2,
  sizeBytes: 1024,
  source: 'scan' as const,
  fileName: 'a.pdf',
};

async function show(ui: React.ReactElement) {
  await render(themed(ui));
  await settleTheme();
}

test('DocumentRow uses the dark palette', async () => {
  await show(<DocumentRow doc={doc as never} onPress={() => {}} onLongPress={() => {}} />);
  expect(styleOf(screen.getByText('Hoa don')).color).toBe('#e8e8e8');
  expect(styleOf(screen.getByText(/2 trang/)).color).toBe('#a0a0a0');
  expect(styleOf(screen.getByRole('button')).borderBottomColor).toBe('#333');
});

test('NameInput uses the dark palette', async () => {
  await show(<NameInput value="x" onChangeText={() => {}} placeholder="Tên" />);
  expect(styleOf(screen.getByText('Tên tài liệu')).color).toBe('#a0a0a0');
  const input = screen.getByLabelText('Tên tài liệu');
  expect(styleOf(input)).toMatchObject({ color: '#e8e8e8', borderColor: '#333' });
  expect(input.props.placeholderTextColor).toBe('#a0a0a0');
});

test('SegmentedControl uses the dark palette', async () => {
  await show(
    <SegmentedControl
      label="Khổ"
      options={[
        { value: 'a4', label: 'A4' },
        { value: 'letter', label: 'Letter' },
      ]}
      value="a4"
      onChange={() => {}}
    />,
  );
  const [selected] = screen.getAllByRole('button');
  expect(styleOf(selected).backgroundColor).toBe('#4c8dff');
  expect(styleOf(screen.getByText('A4')).color).toBe('#fff');
  expect(styleOf(screen.getByText('Letter')).color).toBe('#4c8dff');
  expect(styleOf(screen.getByText('Khổ')).color).toBe('#a0a0a0');
});

test('light mode keeps the original colors', async () => {
  mockColorScheme = 'light';
  await show(<DocumentRow doc={doc as never} onPress={() => {}} onLongPress={() => {}} />);
  expect(styleOf(screen.getByText(/2 trang/)).color).toBe('#666');
  expect(styleOf(screen.getByText('Hoa don')).color).toBe('#1f1f1f');
});


describe('English', () => {
  const showEn = async (ui: React.ReactElement) => {
    await render(themed(<LocaleProvider fs={createMemoryFs()}>{ui}</LocaleProvider>));
    await settleTheme();
  };

  test('DocumentRow meta', async () => {
    const one = { ...doc, createdAt: '2026-10-05T14:03:00', pageCount: 1 };
    await showEn(<DocumentRow doc={one as never} onPress={() => {}} onLongPress={() => {}} />);
    expect(screen.getByText('10/05/2026 14:03 · 1 page · 1.0 KB')).toBeTruthy();
  });

  test('NameInput label', async () => {
    await showEn(<NameInput value="x" onChangeText={() => {}} />);
    expect(screen.getByText('Document name')).toBeTruthy();
    expect(screen.getByLabelText('Document name')).toBeTruthy();
  });
});
