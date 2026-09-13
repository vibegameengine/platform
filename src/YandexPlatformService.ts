import { BasePlatformService } from './BasePlatformService';
import {
  ILeaderboardsService,
  LeaderboardDescription,
  LeaderboardEntries,
  LeaderboardEntriesOptions,
  LeaderboardEntryDetails,
  LeaderboardPlayerNotPresentError,
} from './types';

export interface YandexPlayer {
  getMode(): string;
  getName(): string;
  getPhoto(size: string): string;
  getUniqueID(): string;
  setData(data: Record<string, any>, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, any>>;
}

/**
 * The object `ysdk.getLeaderboards()` resolves with. It is already the shape
 * this package exposes — that is the whole reason the shape was chosen — so the
 * adapter below is a pass-through except where Yandex signals "no entry".
 */
export interface YandexLeaderboard {
  getLeaderboardDescription(leaderboardName: string): Promise<LeaderboardDescription>;
  setLeaderboardScore(leaderboardName: string, score: number, extraData?: string): Promise<void>;
  getLeaderboardEntries(
    leaderboardName: string,
    options?: LeaderboardEntriesOptions,
  ): Promise<LeaderboardEntries>;
  getLeaderboardPlayerEntry(leaderboardName: string): Promise<LeaderboardEntryDetails>;
}

export interface YandexAdv {
  showFullscreenAdv(callbacks?: {
    onOpen?: () => void;
    onClose?: (wasShown: boolean) => void;
    onError?: (error: any) => void;
    onOffline?: () => void;
  }): void;

  showRewardedVideo(callbacks?: {
    onOpen?: () => void;
    onRewarded?: () => void;
    onClose?: () => void;
    onError?: (error: any) => void;
  }): void;
}

export interface YandexSDK {
  getPlayer(options?: { scopes?: boolean; signed?: boolean }): Promise<YandexPlayer>;
  getLeaderboards(): Promise<YandexLeaderboard>;
  adv: YandexAdv;
  environment: {
    i18n: {
      lang: string;
      tld: string;
    };
  };
}

export interface YandexPlatformOptions {
  storageKey?: string;
  /** The board the v1 `setLeaderboardScore(score)` shim writes to. */
  leaderboardName?: string;
}

export class YandexPlatformService<TSaveData = unknown> extends BasePlatformService<TSaveData> {
  private readonly sdk: YandexSDK;
  private readonly storageKey: string;
  private player: YandexPlayer | null = null;
  private leaderboards: ILeaderboardsService | null = null;

  constructor(sdk: YandexSDK, options: YandexPlatformOptions = {}) {
    super(options.leaderboardName ?? 'vge_leaderboard_scores');
    this.sdk = sdk;
    this.storageKey = options.storageKey ?? 'vge_platform_save_v1';
  }

  async init(): Promise<void> {
    this.player = await this.sdk.getPlayer({ scopes: false });
    this.leaderboards = wrap(await this.sdk.getLeaderboards());
  }

  getPlayerName(): string {
    if (!this.player) return 'Player';
    const name = this.player.getName();
    return name || 'Anonymous';
  }

  getLanguage(): string {
    const lang = this.sdk.environment.i18n.lang;
    return lang === 'en' ? 'en' : 'ru';
  }

  async getLeaderboards(): Promise<ILeaderboardsService> {
    if (!this.leaderboards) {
      throw new Error('YandexPlatformService.init() has not finished yet.');
    }
    return this.leaderboards;
  }

  protected currentPlayerId(): string | null {
    return this.player?.getUniqueID() ?? null;
  }

  async saveData(data: TSaveData): Promise<boolean> {
    if (!this.player) return false;

    try {
      await this.player.setData(
        {
          [this.storageKey]: JSON.stringify(data),
        },
        true,
      );
      return true;
    } catch {
      return false;
    }
  }

  async loadData(): Promise<TSaveData | null> {
    if (!this.player) return null;

    try {
      const data = await this.player.getData([this.storageKey]);
      if (data && data[this.storageKey]) {
        return JSON.parse(data[this.storageKey]) as TSaveData;
      }
    } catch {
      return null;
    }

    return null;
  }

  async showInterstitial(): Promise<void> {
    return new Promise((resolve) => {
      this.sdk.adv.showFullscreenAdv({
        onClose: () => resolve(),
        onError: () => resolve(),
        onOffline: () => resolve(),
      });
    });
  }

  async showRewardedAd(): Promise<boolean> {
    return new Promise((resolve) => {
      let rewarded = false;

      this.sdk.adv.showRewardedVideo({
        onRewarded: () => {
          rewarded = true;
        },
        onClose: () => resolve(rewarded),
        onError: () => resolve(false),
      });
    });
  }
}

/**
 * Yandex rejects `getLeaderboardPlayerEntry` for a player with no score. The
 * rejection is translated so a game can catch one error type regardless of which
 * platform it is running on.
 */
function wrap(leaderboards: YandexLeaderboard): ILeaderboardsService {
  return {
    getLeaderboardDescription: (name) => leaderboards.getLeaderboardDescription(name),
    setLeaderboardScore: (name, score, extraData) =>
      leaderboards.setLeaderboardScore(name, score, extraData),
    getLeaderboardEntries: (name, options) => leaderboards.getLeaderboardEntries(name, options),
    getLeaderboardPlayerEntry: async (name) => {
      try {
        return await leaderboards.getLeaderboardPlayerEntry(name);
      } catch (error) {
        if (isPlayerNotPresent(error)) {
          throw new LeaderboardPlayerNotPresentError(name);
        }
        throw error;
      }
    },
  };
}

function isPlayerNotPresent(error: unknown): boolean {
  const code = (error as { code?: unknown })?.code;
  const message = (error as { message?: unknown })?.message;
  const text = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  return /NOT_PRESENT|not\s+present|not\s+found/i.test(text);
}
