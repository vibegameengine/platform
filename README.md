# @vibegameengine/platform

Cross-platform game platform layer for web games.

The package provides:
- a unified platform interface (`IPlatformService<TSaveData>`)
- a platform registry (`setPlatform`, `getPlatform`, `platformLoader`)
- a development mock provider (`MockPlatformService`)
- a Yandex Games provider (`YandexPlatformService`)

---

## Install

```bash
npm i @vibegameengine/platform
```

---

## Core idea

Define your game save model once and keep game logic independent from SDK details.

```ts
import { IPlatformService } from '@vibegameengine/platform';

type SaveModel = {
  credits: number;
  highScore: number;
};

function runGame(platform: IPlatformService<SaveModel>) {
  // Your game code depends on the interface, not on specific SDKs
}
```

---

## API

### `IPlatformService<TSaveData>`

```ts
interface IPlatformService<TSaveData = unknown> {
  init(): Promise<void>;
  getPlayerName(): string;
  getLanguage(): string;
  saveData(data: TSaveData): Promise<boolean>;
  loadData(): Promise<TSaveData | null>;
  showInterstitial(): Promise<void>;
  showRewardedAd(): Promise<boolean>;
  setLeaderboardScore(score: number): Promise<void>;
  getLeaderboardEntries(): Promise<LeaderboardEntry[]>;
}
```

### Registry helpers

```ts
setPlatform(service)
getPlatform<TSaveData>()
platformLoader // Promise resolved after setPlatform
```

---

## Detailed usage example (Mock in development)

### 1) Define your game save data model

```ts
// save-model.ts
export interface SaveModel {
  credits: number;
  cores: number;
  highScore: number;
  adFreeUntil: number;
}

export const DEFAULT_SAVE: SaveModel = {
  credits: 0,
  cores: 0,
  highScore: 0,
  adFreeUntil: 0
};
```

### 2) Initialize platform before app render

```ts
// bootstrap.ts
import { MockPlatformService, setPlatform } from '@vibegameengine/platform';
import { SaveModel } from './save-model';

const platform = new MockPlatformService<SaveModel>({
  storageKey: 'mygame_save_v1',
  languageKey: 'mygame_lang_v1',
  highScoreKey: 'mygame_hs_v1',
  adDurationMs: 2000,
  initDelayMs: 300,
  loadDelayMs: 150,
  playerName: 'DevPlayer'
});

await platform.init();
setPlatform<SaveModel>(platform);
```

### 3) Wait for platform and render app

```ts
// main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { platformLoader } from '@vibegameengine/platform';
import App from './App';

platformLoader.then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
});
```

### 4) Use platform inside game logic

```ts
// game-service.ts
import { getPlatform } from '@vibegameengine/platform';
import { SaveModel, DEFAULT_SAVE } from './save-model';

export async function loadProfile(): Promise<SaveModel> {
  const platform = getPlatform<SaveModel>();
  return (await platform.loadData()) ?? DEFAULT_SAVE;
}

export async function saveProfile(profile: SaveModel): Promise<void> {
  const platform = getPlatform<SaveModel>();
  await platform.saveData(profile);
}

export async function tryRewarded(): Promise<boolean> {
  const platform = getPlatform<SaveModel>();
  return platform.showRewardedAd();
}

export async function showInterstitial(): Promise<void> {
  const platform = getPlatform<SaveModel>();
  await platform.showInterstitial();
}
```

---

## Yandex provider example

```ts
import {
  YandexPlatformService,
  YandexSDK,
  setPlatform
} from '@vibegameengine/platform';

type SaveModel = {
  credits: number;
  highScore: number;
};

declare global {
  interface Window {
    YaGames: {
      init(): Promise<YandexSDK>;
    };
  }
}

const sdk = await window.YaGames.init();

const platform = new YandexPlatformService<SaveModel>(sdk, {
  storageKey: 'mygame_save_v1',
  leaderboardName: 'mygame_scores'
});

await platform.init();
setPlatform<SaveModel>(platform);
```

---

## Notes

- Keep `TSaveData` stable and versioned in your game.
- Platform methods are O(1) from app-side perspective; SDK/network latency dominates real time.
- Always resolve ad errors gracefully (do not block gameplay on ad failure).
- Use game-specific wrapper services if you want strict domain boundaries.
