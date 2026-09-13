import { planRanges } from './entryWindow';
import { formatScore } from './formatScore';
import { BasePlatformService } from './BasePlatformService';
import {
  ILeaderboardsService,
  LeaderboardDescription,
  LeaderboardEntries,
  LeaderboardEntryDetails,
  LeaderboardPlayerNotPresentError,
  LeaderboardScoreType,
} from './types';

/** A board the mock pretends the developer console has configured. */
export interface MockLeaderboardDeclaration {
  name: string;
  title?: Record<string, string>;
  type?: LeaderboardScoreType;
  invertSortOrder?: boolean;
  decimalOffset?: number;
  default?: boolean;
}

export interface MockPlatformOptions {
  storageKey?: string;
  languageKey?: string;
  /** v1 key holding a single high score. Read once, to carry old dev data over. */
  highScoreKey?: string;
  /** Where the mock keeps the player's score on every board. */
  leaderboardsKey?: string;
  /** The board the v1 `setLeaderboardScore(score)` shim writes to. */
  leaderboardName?: string;
  /** Boards this mock knows about. Defaults to one, named `leaderboardName`. */
  leaderboards?: MockLeaderboardDeclaration[];
  adDurationMs?: number;
  initDelayMs?: number;
  loadDelayMs?: number;
  playerName?: string;
  mockNames?: string[];
}

const DEFAULT_MOCK_NAMES = ['CyberNinja', 'NeonRider', 'PixelKing', 'VoxelViper', 'DataMiner', 'GlitchHunter'];

const MOCK_PLAYER_ID = 'mock-player';

interface StoredScore {
  score: number;
  extraData?: string;
  /** Ordinal, not a clock: it only has to order the mock board reproducibly. */
  achievedAt: number;
}

interface Row {
  id: string;
  name: string;
  score: number;
  extraData?: string;
  achievedAt: number;
}

export class MockPlatformService<TSaveData = unknown> extends BasePlatformService<TSaveData> {
  private readonly storageKey: string;
  private readonly languageKey: string;
  private readonly highScoreKey: string;
  private readonly leaderboardsKey: string;
  private readonly adDurationMs: number;
  private readonly initDelayMs: number;
  private readonly loadDelayMs: number;
  private readonly mockNames: string[];
  private readonly boards: Required<MockLeaderboardDeclaration>[];
  private _playerName: string;
  private clock = 0;

  constructor(options: MockPlatformOptions = {}) {
    const defaultName = options.leaderboardName ?? 'vge_leaderboard_scores';
    super(defaultName);
    this.storageKey = options.storageKey ?? 'vge_platform_save_v1';
    this.languageKey = options.languageKey ?? 'vge_platform_lang_v1';
    this.highScoreKey = options.highScoreKey ?? 'vge_platform_high_score_v1';
    this.leaderboardsKey = options.leaderboardsKey ?? 'vge_platform_leaderboards_v1';
    this.adDurationMs = options.adDurationMs ?? 2000;
    this.initDelayMs = options.initDelayMs ?? 300;
    this.loadDelayMs = options.loadDelayMs ?? 150;
    this._playerName = options.playerName ?? 'DevPlayer';
    this.mockNames = options.mockNames ?? DEFAULT_MOCK_NAMES;
    this.boards = (options.leaderboards ?? [{ name: defaultName, default: true }]).map(
      (board) => ({
        name: board.name,
        title: board.title ?? { en: board.name },
        type: board.type ?? 'numeric',
        invertSortOrder: board.invertSortOrder ?? false,
        decimalOffset: board.decimalOffset ?? 0,
        default: board.default ?? false,
      }),
    );
  }

  async init(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.initDelayMs));
  }

  getPlayerName(): string {
    return this._playerName;
  }

  protected currentPlayerId(): string | null {
    return MOCK_PLAYER_ID;
  }

  getLanguage(): string {
    const saved = localStorage.getItem(this.languageKey);
    if (saved) return saved;
    return navigator.language.includes('ru') ? 'ru' : 'en';
  }

  setMockLanguage(lang: 'en' | 'ru'): void {
    localStorage.setItem(this.languageKey, lang);
  }

  async saveData(data: TSaveData): Promise<boolean> {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  async loadData(): Promise<TSaveData | null> {
    await new Promise((resolve) => setTimeout(resolve, this.loadDelayMs));
    try {
      const saved = localStorage.getItem(this.storageKey);
      if (saved) {
        return JSON.parse(saved) as TSaveData;
      }
    } catch {
      return null;
    }

    return null;
  }

  async showInterstitial(): Promise<void> {
    await this.renderAdOverlay('INTERSTITIAL');
  }

  async showRewardedAd(): Promise<boolean> {
    return this.renderAdOverlay('REWARDED');
  }

  private renderAdOverlay(type: 'INTERSTITIAL' | 'REWARDED'): Promise<boolean> {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'mock-ad-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 2147483647;
        background-color: #000;
        display: flex;
        flex-direction: column;
        font-family: 'Segoe UI', monospace;
        color: white;
      `;

      const isReward = type === 'REWARDED';
      let progress = 0;
      const stepMs = 20;
      const ticks = Math.max(1, Math.floor(this.adDurationMs / stepMs));
      const progressStep = 100 / ticks;

      overlay.innerHTML = `
        <div style="padding: 10px; display: flex; justify-content: space-between; background: #111; border-bottom: 1px solid #333;">
          <span style="background: #333; padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #888;">ADVERTISEMENT</span>
          <span id="ad-timer" style="font-size: 12px; color: #aaa;">LOADING...</span>
        </div>

        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0f0e17; position: relative; overflow: hidden;">
            <div style="position: absolute; inset: 0; opacity: 0.1; background-image: repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), repeating-linear-gradient(45deg, #000 25%, #111 25%, #111 75%, #000 75%, #000); background-position: 0 0, 10px 10px; background-size: 20px 20px;"></div>
            <h1 style="font-size: 32px; font-weight: 900; margin-bottom: 20px; color: #facc15; text-transform: uppercase; text-align: center; z-index: 1;">
                SUPER MOBILE GAME
            </h1>
            <div style="font-size: 64px; margin-bottom: 30px; animation: bounce 1s infinite; z-index: 1;">🦄</div>
            <div style="background: #22c55e; color: white; padding: 15px 40px; border-radius: 50px; font-weight: bold; font-size: 18px; cursor: pointer; z-index: 1;">
                INSTALL FREE
            </div>
        </div>

        <div style="padding: 20px; background: #111; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #333;">
           <button id="ad-fail-btn" style="background: transparent; border: none; color: #666; text-decoration: underline; font-size: 10px; cursor: pointer;">
             [FAIL/CLOSE]
           </button>
           <button id="ad-close-btn" disabled style="
              background: #333; color: #555; border: none; padding: 10px 30px;
              border-radius: 4px; font-weight: bold; cursor: not-allowed; transition: all 0.2s;
           ">
              WAIT...
           </button>
        </div>
      `;

      document.body.appendChild(overlay);

      const timerEl = overlay.querySelector('#ad-timer') as HTMLElement;
      const closeBtn = overlay.querySelector('#ad-close-btn') as HTMLButtonElement;
      const failBtn = overlay.querySelector('#ad-fail-btn') as HTMLButtonElement;

      const interval = setInterval(() => {
        progress += progressStep;
        const normalizedProgress = Math.min(100, progress);
        const remaining = Math.max(0, 100 - normalizedProgress);

        timerEl.innerText = isReward
          ? `REWARD IN ${Math.ceil(remaining / 20)}s`
          : `SKIP IN ${Math.ceil(remaining / 20)}s`;

        if (normalizedProgress >= 100) {
          clearInterval(interval);
          timerEl.innerText = isReward ? 'REWARD GRANTED' : 'CAN SKIP';
          timerEl.style.color = '#4ade80';

          closeBtn.disabled = false;
          closeBtn.style.background = '#0891b2';
          closeBtn.style.color = 'white';
          closeBtn.style.cursor = 'pointer';
          closeBtn.innerText = isReward ? 'CLAIM REWARD' : 'CLOSE AD';
        }
      }, stepMs);

      const close = (success: boolean) => {
        clearInterval(interval);
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        resolve(success);
      };

      closeBtn.onclick = () => close(true);
      failBtn.onclick = () => close(false);
    });
  }

  async getLeaderboards(): Promise<ILeaderboardsService> {
    return {
      getLeaderboardDescription: async (name): Promise<LeaderboardDescription> => {
        return this.describe(this.board(name));
      },

      setLeaderboardScore: async (name, score, extraData): Promise<void> => {
        const board = this.board(name);
        const stored = this.readScores();
        const current = stored[board.name];
        // Best-score-wins, as on the hosted platforms: a game that posts every
        // run's result must not be able to demote its own player.
        const better =
          !current || (board.invertSortOrder ? score < current.score : score > current.score);
        if (better) {
          stored[board.name] = { score, extraData, achievedAt: ++this.clock };
          this.writeScores(stored);
        }
      },

      getLeaderboardEntries: async (name, options): Promise<LeaderboardEntries> => {
        const board = this.board(name);
        const rows = this.rows(board);
        const userIndex = rows.findIndex((row) => row.id === MOCK_PLAYER_ID);
        const userRank = userIndex < 0 ? 0 : userIndex + 1;
        const ranges = planRanges({
          total: rows.length,
          userRank,
          includeUser: options?.includeUser ?? false,
          quantityTop: options?.quantityTop ?? 5,
          quantityAround: options?.quantityAround ?? 5,
        });
        const entries = ranges.flatMap((range) =>
          rows
            .slice(range.start, range.start + range.size)
            .map((row, offset) => this.toEntry(board, row, range.start + offset + 1)),
        );
        return { leaderboard: this.describe(board), ranges, userRank, entries };
      },

      getLeaderboardPlayerEntry: async (name): Promise<LeaderboardEntryDetails> => {
        const board = this.board(name);
        const rows = this.rows(board);
        const index = rows.findIndex((row) => row.id === MOCK_PLAYER_ID);
        if (index < 0) {
          throw new LeaderboardPlayerNotPresentError(name);
        }
        return this.toEntry(board, rows[index], index + 1);
      },
    };
  }

  /** Wipes the mock board, for a dev who wants to see the empty state again. */
  resetLeaderboards(): void {
    try {
      localStorage.removeItem(this.leaderboardsKey);
      localStorage.removeItem(this.highScoreKey);
    } catch {
      return;
    }
  }

  private board(name: string): Required<MockLeaderboardDeclaration> {
    const lowered = name.toLowerCase();
    const found = this.boards.find((board) => board.name.toLowerCase() === lowered);
    if (!found) {
      throw new Error(`Mock leaderboard "${name}" is not declared in MockPlatformOptions.`);
    }
    return found;
  }

  private describe(board: Required<MockLeaderboardDeclaration>): LeaderboardDescription {
    return {
      appID: 'mock-app',
      default: board.default,
      description: {
        invert_sort_order: board.invertSortOrder,
        score_format: { options: { decimal_offset: board.decimalOffset } },
        type: board.type,
      },
      name: board.name,
      title: board.title,
    };
  }

  /** The whole board, in rank order: the invented rivals plus the player. */
  private rows(board: Required<MockLeaderboardDeclaration>): Row[] {
    const rivals: Row[] = this.mockNames.map((name, index) => ({
      id: `mock-${index}`,
      name,
      // Derived from the index alone, never from Math.random: a rival whose
      // score changed on every read would reshuffle the board between frames.
      score: board.invertSortOrder
        ? (90 + index * 15) * 10 ** board.decimalOffset
        : (100000 - index * 5000) * 10 ** board.decimalOffset,
      achievedAt: index,
    }));

    const stored = this.readScores()[board.name];
    const rows = stored
      ? [
          ...rivals,
          {
            id: MOCK_PLAYER_ID,
            name: this._playerName,
            score: stored.score,
            extraData: stored.extraData,
            // After every rival, so an equal score ranks behind them — the same
            // "whoever got there first" rule the hosted platforms apply.
            achievedAt: this.mockNames.length + stored.achievedAt,
          },
        ]
      : rivals;

    return rows.sort((a, b) => {
      if (a.score !== b.score) {
        return board.invertSortOrder ? a.score - b.score : b.score - a.score;
      }
      return a.achievedAt - b.achievedAt;
    });
  }

  private toEntry(
    board: Required<MockLeaderboardDeclaration>,
    row: Row,
    rank: number,
  ): LeaderboardEntryDetails {
    return {
      score: row.score,
      ...(row.extraData === undefined ? {} : { extraData: row.extraData }),
      rank,
      player: {
        uniqueID: row.id,
        publicName: row.name,
        lang: this.getLanguage(),
        scopePermissions: { avatar: 'not_set', public_name: 'allow' },
        getAvatarSrc: () => '',
        getAvatarSrcSet: () => '',
      },
      formattedScore: formatScore(row.score, board.type, board.decimalOffset),
    };
  }

  private readScores(): Record<string, StoredScore> {
    let scores: Record<string, StoredScore> = {};
    try {
      const raw = localStorage.getItem(this.leaderboardsKey);
      if (raw) {
        scores = JSON.parse(raw) as Record<string, StoredScore>;
      }
    } catch {
      scores = {};
    }
    // Carry a v1 high score over, so a developer's existing local state does
    // not silently vanish the first time they run a build of this version.
    if (!scores[this.defaultLeaderboardName]) {
      const legacy = this.readLegacyHighScore();
      if (legacy !== null) {
        scores[this.defaultLeaderboardName] = { score: legacy, achievedAt: 0 };
      }
    }
    return scores;
  }

  private readLegacyHighScore(): number | null {
    try {
      const raw = localStorage.getItem(this.highScoreKey);
      if (!raw) {
        return null;
      }
      const parsed = Number.parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private writeScores(scores: Record<string, StoredScore>): void {
    try {
      localStorage.setItem(this.leaderboardsKey, JSON.stringify(scores));
    } catch {
      return;
    }
  }
}
