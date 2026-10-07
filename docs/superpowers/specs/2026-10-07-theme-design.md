# iScanner — Light / Dark / System Theme — Design Spec

- **Date:** 2026-10-07
- **Source:** requirement "07/10/2026 - sequence 1": add a dark theme, a light theme and a system theme that follows the device setting.
- **Status:** Approved in chat; awaiting written-spec review.

## 1. Goal and decisions

The user can choose `Theo hệ thống` (system), `Sáng` (light) or `Tối` (dark):

- In system mode the app follows the device setting live, including while the app is open.
- The choice is kept across restarts.
- The default is system.

| Topic | Decision |
|---|---|
| Where to choose | A ⚙︎ button in the library (`index`) header opens a menu titled `Giao diện` with `Theo hệ thống` / `Sáng` / `Tối` / `Huỷ`. The current choice is marked `✓`. |
| Mechanism | `Appearance.setColorScheme('light' \| 'dark' \| 'unspecified')` (RN 0.86) overrides the scheme for the whole app natively, so Alerts, the keyboard, pickers and the PDF view follow it. Screens read colors from a shared palette through `useTheme()`. |
| Persistence | `settings.json` in `Paths.document`, written with expo-file-system (the same pattern as the library). No new storage dependency. |
| Native config | `userInterfaceStyle: "automatic"` in `app.json`, plus `expo-system-ui` (required on Android for development builds; install with `npx expo install`). |
| Unchanged | The page editor (`PageEditor`, `CornerHandles`) stays dark in both themes, because it is a photo editor. `PagePreview` keeps a white paper page. The processing overlay keeps a black scrim with white text. Images and PDF pages are never recolored. |
| Version | 1.3.0, Android `versionCode` 3, iOS `buildNumber` "3". |

Out of scope:

- Custom accent colors or extra themes.
- Avoiding the brief flash before the saved preference loads (accepted, see §4).
- A settings screen.

## 2. Modules

### 2.1 `src/theme/palette.ts` (pure data)

```ts
type Palette = {
  background: string; surface: string; surfaceActive: string; text: string; textMuted: string;
  border: string; primary: string; onPrimary: string; danger: string; backdrop: string; placeholder: string;
};
export const lightPalette: Palette; export const darkPalette: Palette;
export function paletteFor(scheme: 'light' | 'dark'): Palette;
```

| Token | Light | Dark | Use |
|---|---|---|---|
| background | `#fff` | `#121212` | screen background |
| surface | `#fff` | `#1e1e1e` | rows, dialogs, menus |
| surfaceActive | `#eef4ff` | `#1c2b45` | row being dragged |
| text | `#1f1f1f` | `#e8e8e8` | primary text (always set explicitly) |
| textMuted | `#666` | `#a0a0a0` | secondary text, page counts, labels |
| border | `#ddd` | `#333` | separators, input and segment borders |
| primary | `#1f6feb` | `#4c8dff` | buttons, links, selected segment |
| onPrimary | `#fff` | `#fff` | text on primary |
| danger | `#d1242f` | `#ff6b6b` | delete actions |
| backdrop | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.6)` | modal backdrop |
| placeholder | `#eee` | `#2a2a2a` | thumbnail placeholder; text-input placeholder text uses `textMuted` |

### 2.2 `src/theme/preference.ts`

```ts
export type ThemePreference = 'system' | 'light' | 'dark';
export function toNativeScheme(p: ThemePreference): 'light' | 'dark' | 'unspecified'; // pure
export function parsePreference(json: string | null): ThemePreference;                // pure; invalid or missing → 'system'
export function loadPreference(deps?): Promise<ThemePreference>;  // reads settings.json; never throws → 'system'
export function savePreference(p: ThemePreference, deps?): Promise<void>; // writes {"theme": p}; may reject
```

The file layer is injectable (or wrapped in `src/native/`) so tests can mock it. `settings.json` holds an object (`{"theme": "dark"}`), so later settings can be added without a migration.

### 2.3 `src/theme/ThemeContext.tsx`

- `ThemeProvider` (app-level, separate from the navigation `ThemeProvider`):
  - On mount it calls `loadPreference()` and then `Appearance.setColorScheme(toNativeScheme(p))`.
  - It reads the effective scheme from `useColorScheme()`; a `null` or unknown value counts as `'light'`.
- `useTheme(): { colors: Palette; scheme: 'light' | 'dark'; preference: ThemePreference; setPreference(p) }`.
- `setPreference(p)`:
  1. Updates state and calls `Appearance.setColorScheme` immediately.
  2. Then calls `savePreference(p)`.
  3. A save failure is swallowed: the theme still applies for the session, and no alert is shown.

### 2.4 `src/components/ActionMenu.tsx`

This is the generic Android menu, extracted from `DocumentActions`:

```ts
type ActionMenuItem = { label: string; onPress: () => void; destructive?: boolean; selected?: boolean };
type Props = { visible: boolean; title: string; items: ActionMenuItem[]; onClose: () => void };
```

- It is a Modal with a backdrop press and a hardware-back close, the same as today.
- A selected item renders as `✓ <label>`.
- `DocumentActions` becomes a thin wrapper over it (or `index` uses `ActionMenu` directly). The document menu's behavior and labels are unchanged.

## 3. Screen and config changes

- **`app/_layout.tsx`**
  - Wrap the tree in the theme `ThemeProvider`.
  - Inside it, use expo-router's navigation `ThemeProvider` with `DarkTheme` or `DefaultTheme`, with `colors.primary`, `background`, `card`, `text` and `border` overridden from the palette.
  - Add `<StatusBar style="auto" />` from expo-status-bar.
- **`app/index.tsx`**
  - Add `headerRight`: a `⚙︎` pressable with accessibility label `Giao diện`.
  - iOS: `ActionSheetIOS` with options `✓`-prefixed for the current choice, then `Huỷ` as cancel.
  - Android: `ActionMenu`.
  - Choosing an option calls `setPreference`.
- **Themed screens and components:** `index`, `scan`, `merge`, `incoming`, `viewer/[id]`, `DocumentRow`, `ActionMenu`/`DocumentActions`, `NameInput`, `SegmentedControl`.
  - Hard-coded colors are replaced with palette tokens.
  - Layout stays in `StyleSheet.create`; colors come from `makeStyles(colors)` memoized with `useMemo`.
  - Every `Text` gets an explicit color, and `TextInput` gets a text color and `placeholderTextColor`.
- **`app.json`:**
  - set `userInterfaceStyle` to `"automatic"`;
  - set the version to `1.3.0`, `android.versionCode` to 3 and `ios.buildNumber` to "3";
  - add the `expo-system-ui` plugin if its install adds one.

## 4. Error handling and edge cases

| Situation | Behavior |
|---|---|
| `settings.json` missing, unreadable or invalid | Theme `system`. |
| Save fails | The theme applies for this session; it is silently not persisted. |
| Saved non-system preference at launch | The app renders with the system scheme until the file loads (a few ms) and then switches. A one-time flash is accepted. |
| `useColorScheme()` returns `null` (older OS) | Treated as `light`. |
| Device theme changes in system mode | `useColorScheme()` updates, so the screens re-render live. |
| Device theme changes in light/dark mode | Ignored (the override stays). |

## 5. Testing

- **Unit:**
  - `toNativeScheme` (all 3 values);
  - `parsePreference` (valid, invalid JSON, unknown value, null);
  - `loadPreference` / `savePreference` with a mocked fs;
  - the palettes have identical keys and non-empty values.
- **Components and screens (RNTL v14, awaited):**
  - `ThemeProvider`: on mount `Appearance.setColorScheme` is called with the saved value; `setPreference('dark')` saves and calls `setColorScheme('dark')`; a save rejection does not throw.
  - `index`: ⚙︎ opens a menu with `✓` on the current choice; choosing `Tối` calls `setPreference('dark')`.
  - `ActionMenu`: items, selected mark, backdrop and back close.
  - The existing `DocumentActions` and library menu tests still pass.
  - A screen rendered with a mocked dark scheme uses the dark background.
- **Android emulator:**
  - `Tối` / `Sáng` recolor the whole app, including Alerts.
  - In `Theo hệ thống`, `adb shell cmd uimode night yes|no` switches the open app live.
  - The choice survives a restart.
- **iOS:** `expo config --type introspect` shows `UIUserInterfaceStyle` `Automatic`. A functional test on the real iPhone is left to the user.

## 6. Success criteria

1. Three choices are available from ⚙︎ on the library, and the current one is marked.
2. Light and dark apply to all screens, headers, status bar and system dialogs. In system mode the app follows the device live.
3. The choice persists across restarts, and a bad settings file never crashes the app.
4. The page editor and the PDF preview look as before.
5. All tests and typecheck pass, and the Android flows are verified on the emulator.
