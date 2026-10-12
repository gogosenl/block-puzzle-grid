<div align="center">
  <img src="assets/app-icon.png" width="152" alt="Block Puzzle Grid app icon" />
  <h1>Block Puzzle Grid</h1>
  <p>A polished, time-based block-placement puzzle game for iOS and Android.</p>
  <p>
    <a href="https://apps.apple.com/app/id6800597451">App Store</a>
    &nbsp;|&nbsp;
    <a href="https://play.google.com/store/apps/details?id=com.gorsengames.puzzlegrid">Google Play</a>
  </p>
</div>

## Overview

Block Puzzle Grid is a mobile puzzle game built with React Native and Expo. Players drag colorful pieces onto a board, complete each grid before time runs out, earn up to three stars, and unlock increasingly demanding layers from 3x3 to 9x9.

The project is published as a portfolio case study for a production mobile game. It demonstrates deterministic content generation, responsive touch interaction, persistent progression, native advertising and in-app purchase integrations, and release configuration for both major mobile platforms.

## Highlights

- 640 deterministic puzzle levels across seven grid sizes
- Drag-and-drop placement with board-boundary and collision validation
- Per-level countdowns and one-to-three-star scoring based on remaining time
- Persistent progress, currency, settings, purchases, and earned stars
- Responsive layouts for phones and tablets on iOS and Android
- English and Turkish localization
- Hint, undo, restart, sound, music, and haptic feedback systems
- Rewarded and interstitial advertising with a paid remove-ads option
- Consumable in-app purchase packs and purchase restoration
- Native App Store rating prompts and store update routing
- Automatic level validation covering every generated board

## Progression

| Layer | Levels | Unlock |
| --- | ---: | ---: |
| 3x3 | 1-3 | Free |
| 4x4 | 4-21 | Free |
| 5x5 | 22-40 | 55 layer coins |
| 6x6 | 41-190 | 150 layer coins |
| 7x7 | 191-340 | 150 layer coins |
| 8x8 | 341-490 | 150 layer coins |
| 9x9 | 491-640 | 150 layer coins |

Each completed level awards one hint coin and one layer coin. Difficulty and time limits scale with board size and level progression.

## Technical Stack

- React Native 0.81
- Expo SDK 54
- React 19
- Expo FileSystem for local persistence
- Expo IAP / OpenIAP for store purchases
- Google Mobile Ads for rewarded and interstitial ads
- Expo Store Review for native rating prompts
- EAS Build for signed iOS and Android releases

## Engineering Notes

Level data is generated from seeded rules, so the same level number always produces the same solvable board. The validator reconstructs all 640 levels and checks that:

- every target cell is inside the board;
- pieces do not overlap in their solved positions;
- every board is completely covered;
- no generated level contains more than three single-cell pieces; and
- every level receives a valid time limit.

The gameplay layer also keeps rendered cell sizes, drag coordinates, safe-area spacing, and placement calculations in sync across different screen dimensions.

## Run Locally

Requirements:

- Node.js 20 or newer
- npm
- Expo-compatible Android or iOS development environment

```bash
npm install
npm run online
```

Then open the project in a development build. Native advertising and in-app purchase modules are not available in Expo Go.

Useful commands:

```bash
npm run android
npm run ios
npm run validate
```

## Production Builds

```bash
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Building production binaries requires access to the linked Expo project and the appropriate Apple or Google signing credentials. No signing keys, certificates, provisioning profiles, service-account files, or environment files are stored in this repository.

## Project Structure

```text
.
|-- App.js                         # Game state, screens, gameplay, ads and purchases
|-- app.json                      # Expo and native platform configuration
|-- assets/                       # Production icons, artwork and audio
|-- scripts/
|   |-- pin-google-mobile-ads-android-sdk.js
|   `-- validate-current-levels.js
|-- eas.json                      # EAS build profiles
|-- index.js                      # Expo entry point
`-- package.json
```

## Privacy and Repository Safety

This repository intentionally excludes local caches, generated native projects, build artifacts, signing material, credentials, store-delivery assets, logs, and superseded artwork. Identifiers visible in the source are public application identifiers required by the mobile platforms; private credentials are managed outside Git.

## License

Source code and original game assets are published for portfolio review only. Copyright 2026 Gorsen Games. All rights reserved.
