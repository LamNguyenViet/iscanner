# iScanner — agent guide

Expo SDK 57 / React Native 0.86 / TypeScript app (document scanner + PDF merge). Android and iOS only — no web support.

## Expo has changed — do not trust your training data

Before touching an Expo, EAS or React Native API, check the installed version in `package.json` and read the matching docs (`https://docs.expo.dev/versions/v57.0.0/`, index at https://docs.expo.dev/llms.txt).

## Layout

- Routes (Expo Router) live in the root `app/` directory. Never create `src/app/`.
- App logic lives in `src/`. Modules in `src/` must not import React Native UI components; only `src/components/` holds UI building blocks, and `src/library/LibraryContext.tsx` / `src/workflows/useOrderedList.ts` (and other hooks) may import `react`.
- Native wrappers (file system, picker, sharing) live in `src/native/` so screens can mock them in tests.
- Tests live in `__tests__/` (Jest + `@testing-library/react-native` v14 — `render`, `fireEvent`, `act` are async and must be awaited).
- Use relative imports (no path aliases).

## Commands

npm only (no bun, yarn or pnpm).

```bash
npm test                    # Jest
npm run typecheck           # tsc --noEmit
npx expo install <package>  # ALWAYS use for native/Expo packages (SDK-compatible versions)
npm install -D <package>    # dev-only tools
npx expo-doctor             # dependency/config check
```

There is no lint setup — do not run `expo lint` (it would scaffold ESLint config). Run `npm test` and `npm run typecheck` before declaring a task done.

## Running the app

The app uses native modules, so it does **not** run in Expo Go — it needs a development build (`expo-dev-client`): `npx eas-cli build --profile development --platform android|ios` (profiles in `eas.json`) or `npx expo run:android` locally, then `npx expo start --dev-client`. See `README.md`.

- `ios/` and `android/` are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.

## Project records

- Progress log: `docs/superpowers/progress/2026-10-05-iscanner-mvp.md`
- Spec: `docs/superpowers/specs/2026-10-05-camscanner-mvp-design.md`
- All user-facing copy is Vietnamese.
