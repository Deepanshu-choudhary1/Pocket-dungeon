# Pocket Dungeon

A small Expo + React Native project (3D/Three.js + Zustand) for a pocket-sized dungeon demo.

## Prerequisites

- Node.js 18+ (or latest LTS)
- npm or Yarn
- Optional: Android Studio / iOS tooling for emulators, or the Expo Go app on a physical device

## Install

1. Install dependencies:

```bash
npm install
# or
yarn install
```

## Run (development)

- Start the Metro/Expo dev server:

```bash
npm run start
# or
yarn start
```

- Open on Android device/emulator:

```bash
npm run android
# or
yarn android
```

- Open in a browser (web):

```bash
npm run web
# or
yarn web
```

## Quick troubleshooting

- Clear Metro cache if you hit strange bundling errors:

```bash
npx expo start -c
```

- If you see native build issues, try removing `node_modules` and reinstalling:

```bash
rm -rf node_modules
npm install
```

- For running on a physical device, install the Expo Go app and scan the QR code shown by the dev server.

## Building production apps

To produce platform binaries use Expo Application Services (EAS) or the classic Expo build commands. EAS requires an Expo account and additional setup.

## Helpful files

- `App.tsx`: app entry
- `package.json`: scripts and dependencies
- `src/`: application source (components, store, types)
