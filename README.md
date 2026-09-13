# @vibegameengine/platform

Cross-platform game platform layer for web games.

The package provides:
- a unified platform interface (`IPlatformService<TSaveData>`)
- a full leaderboard surface, **API-compatible with the Yandex Games SDK**
- a platform registry (`setPlatform`, `getPlatform`, `platformLoader`)
- a development mock provider (`MockPlatformService`)
- a Yandex Games provider (`YandexPlatformService`)
- a Vibe Game Engine provider (`VibePlatformService`)

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

  /** Named boards, extraData, ranks, ranges — the full surface. */
  getLeaderboards(): Promise<ILeaderboardsService>;

  /** Convenience over the provider's default board. Never throws. */
  setLeaderboardScore(score: number): Promise<void>;
  /** Convenience over the provider's default board. Never throws. */
  getLeaderboardEntries(): Promise<LeaderboardEntry[]>;
}
```

---

## Leaderboards

`getLeaderboards()` resolves with the object Yandex's `ysdk.getLeaderboards()`
resolves with — the same four methods, the same arguments, the same payloads,
including the snake_cased `description` block and the `appID` spelling. A game
written against Yandex leaderboards runs on any provider here with no change to
the code that reads the data.

```ts
interface ILeaderboardsService {
  getLeaderboardDescription(leaderboardName: string): Promise<LeaderboardDescription>;
  setLeaderboardScore(leaderboardName: string, score: number, extraData?: string): Promise<void>;
  getLeaderboardEntries(
    leaderboardName: string,
    options?: LeaderboardEntriesOptions,
  ): Promise<LeaderboardEntries>;
  /** Rejects with `LeaderboardPlayerNotPresentError` before the first score. */
  getLeaderboardPlayerEntry(leaderboardName: string): Promise<LeaderboardEntryDetails>;
}
```

```ts
const leaderboards = await getPlatform().getLeaderboards();

await leaderboards.setLeaderboardScore('highscore', 1234567, 'level-9');

const board = await leaderboards.getLeaderboardEntries('highscore', {
  includeUser: true,   // also return the player and their neighbours
  quantityTop: 10,     // rows from the top (max 20)
  quantityAround: 5,   // rows on *each* side of the player (max 10)
});

board.userRank;  // 1-based, or 0 when the player has no entry
board.ranges;    // 0-based slices the answer covers, merged when they touch
board.entries;   // [{ rank, score, formattedScore, extraData?, player }]
```

Behaviour every provider here shares, hosted or mock:

- **Best score wins.** A submission worse than the player's standing score is
  kept out, so a game that posts the result of every run cannot demote its own
  player. `extraData` travels with the score it belongs to.
- **Ranks are unique.** Equal scores are broken in favour of whoever reached the
  score first, so rows do not swap places between reads.
- **`userRank` is always reported**, whether or not `includeUser` was set.
- **"No entry yet" is not a failure.** `getLeaderboardPlayerEntry` rejects with
  `LeaderboardPlayerNotPresentError`, which a game catches to show an empty row:

```ts
import { LeaderboardPlayerNotPresentError } from '@vibegameengine/platform';

try {
  const mine = await leaderboards.getLeaderboardPlayerEntry('highscore');
  render(mine.rank, mine.formattedScore);
} catch (error) {
  if (error instanceof LeaderboardPlayerNotPresentError) {
    renderEmptyRow();
  } else {
    throw error;
  }
}
```

### Score types and formatting

The stored score is always an integer. A board's `decimalOffset` says where the
decimal point belongs, and its `type` says how the number reads — both come from
the board's description, and `formattedScore` applies them for you:

| type      | score   | decimalOffset | `formattedScore` |
| --------- | ------- | ------------- | ---------------- |
| `numeric` | 1234567 | 0             | `1 234 567`      |
| `numeric` | 1234567 | 2             | `12 345.67`      |
| `time`    | 12345   | 2             | `2:03.45`        |
| `time`    | 3661    | 0             | `1:01:01`        |

`formatScore(score, type, decimalOffset)` is exported for scores a game has not
submitted yet — a running total, a personal best held locally — so they read
identically to the board beside them.

A board with `invert_sort_order: true` ranks the **lowest** score first: lap
times, stroke counts, anything where less is better.

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
  playerName: 'DevPlayer',
  // Declare the same boards the real platform has, so the mock ranks, formats
  // and paginates exactly as production will.
  leaderboards: [
    { name: 'highscore', title: { en: 'High score' }, default: true },
    { name: 'laptime', type: 'time', invertSortOrder: true, decimalOffset: 2 }
  ]
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

## Vibe Game Engine provider

```ts
import { VibePlatformService, setPlatform } from '@vibegameengine/platform';

const platform = new VibePlatformService<SaveModel>({
  // Every option is optional. By default the provider talks to the origin it was
  // served from and reads the game's id out of its own `/play/<slug>/` URL.
  leaderboardName: 'highscore',
});

await platform.init();
setPlatform<SaveModel>(platform);
```

`init()` mints an anonymous player once per browser and keeps the bearer in
`localStorage`, refreshing it by itself if it ever expires. Boards are declared
in the game's `.shipit/shipit.json` and created when `shipit publish` runs.

Two things the platform does not have yet, and this provider does not pretend it
does:

- **No cloud save.** `saveData` / `loadData` use `localStorage`, so progress
  stays on the device.
- **No ad network.** `showInterstitial()` returns at once and `showRewardedAd()`
  grants the reward, so a game gated behind a reward stays playable.

| Option | Default | |
| ------ | ------- | - |
| `baseUrl` | the page's own origin | platform origin |
| `gameId` | read from `/play/<slug>/` | the game's slug |
| `leaderboardName` | `vge_leaderboard_scores` | board the v1 shim writes to |
| `playerName` | generated by the server | name proposed on first run |
| `storageKey` / `tokenKey` | `vge_platform_*_v1` | `localStorage` keys |
| `fetchFn` | global `fetch` | injected in tests |

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

## Upgrading from 1.0

Additive. `setLeaderboardScore(score)` and `getLeaderboardEntries()` keep their
signatures and their habit of never throwing, the provider constructors are
unchanged, and nothing a game calls today behaves differently. Upgrade and reach
for `getLeaderboards()` when you want named boards.

Two things worth knowing:

- If you wrote your **own** provider rather than using the ones here, it now also
  needs `getLeaderboards()`. The shortest way is to extend `BasePlatformService`,
  which implements both convenience methods on top of it:

```ts
class MyPlatformService extends BasePlatformService<SaveModel> {
  constructor() {
    super('highscore');            // the board the convenience methods use
  }

  async getLeaderboards(): Promise<ILeaderboardsService> { /* ... */ }
  protected currentPlayerId(): string | null { /* ... */ }

  // the rest of IPlatformService as before
}
```

- `MockPlatformService` keeps a score per board now, under `leaderboardsKey`,
  instead of one number under `highScoreKey`. An existing `highScoreKey` value is
  read once and carried over, so local dev state is not lost — but the mock no
  longer writes that key, so stop reading it directly if you ever did.

---

## Notes

- Keep `TSaveData` stable and versioned in your game.
- Platform methods are O(1) from app-side perspective; SDK/network latency dominates real time.
- Always resolve ad errors gracefully (do not block gameplay on ad failure).
- Use game-specific wrapper services if you want strict domain boundaries.
