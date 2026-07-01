# Pocket Dungeon

A small 3D roguelike demo built with Expo + React Native + React Three Fiber and Rapier physics.

This repository contains the web and native (Expo) app used during development.

## Prerequisites

- Node.js 18+ (recommended)
- npm or yarn
- Recommended: VS Code with the project opened at the `pocket-dungeon` folder

## Install dependencies

From the project root (`pocket-dungeon/pocket-dungeon`):

```bash
npm install
# or
yarn install
```

## TypeScript check

Ensure the codebase compiles cleanly:

```bash
npx tsc --noEmit
```

## Run in development (Expo)

Start the Expo dev server (Metro):

```bash
npm start
# or
npx expo start
```

- Open on web (recommended for quick iteration):

```bash
npm run web
# or
npx expo start --web
```

- Open on Android/iOS using Expo Go (scan the QR code the Metro page shows) or use the emulator commands:

```bash
npm run android
# (macOS) for iOS simulator
npx expo start --ios
```

## Dev notes / debugging

- Camera debug: append `?debugCamera=1` to the web URL to show camera and look target markers.
- Rapier (physics) runs on WebAssembly; the first load may fetch WASM binaries.
- If you see `applyImpulse failed (body may be invalid)` warnings, they are guarded and non-fatal — they indicate a Rapier body became temporarily unavailable (usually on hot reload).

## Common commands

- Type-check: `npx tsc --noEmit`
- Start dev server: `npm start` or `npx expo start`
- Run web: `npm run web` or `npx expo start --web`
- Run Android: `npm run android`

## Project structure

- `App.tsx` — entry and scene orchestration
- `src/components/` — React components and entities (hero, enemies, level)
- `src/store/rogueStore.tsx` — global state

## Troubleshooting

- If the web build fails with Rapier related errors, try removing `node_modules` and reinstalling:

```bash
rm -rf node_modules package-lock.json && npm install
```

- If testing on a real device via Expo, ensure your computer and device are on the same network.
