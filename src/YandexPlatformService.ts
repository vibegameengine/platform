import { IPlatformService, LeaderboardEntry } from './types';

export interface YandexPlayer {
  getMode(): string;
  getName(): string;
  getPhoto(size: string): string;
  getUniqueID(): string;
  setData(data: Record<string, any>, flush?: boolean): Promise<void>;
  getData(keys?: string[]): Promise<Record<string, any>>;
}

export interface YandexLeaderboard {
  setLeaderboardScore(leaderboardName: string, score: number): Promise<void>;
  getLeaderboardEntries(
    leaderboardName: string,
    options?: {
      includeUser?: boolean;
      quantityAround?: number;
      quantityTop?: number;
    }
  ): Promise<{
    entries: Array<{
      score: number;
      extraData?: string;
      rank: number;
      player: {
        uniqueID: string;
        publicName: string;
        avatarSrc: string;
      };
      formattedScore: string;
    }>;
  }>;
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
  leaderboardName?: string;
}

export class YandexPlatformService<TSaveData = unknown> implements IPlatformService<TSaveData> {
  private readonly sdk: YandexSDK;
  private readonly storageKey: string;
  private readonly leaderboardName: string;
  private player: YandexPlayer | null = null;
  private leaderboard: YandexLeaderboard | null = null;

  constructor(sdk: YandexSDK, options: YandexPlatformOptions = {}) {
    this.sdk = sdk;
    this.storageKey = options.storageKey ?? 'vge_platform_save_v1';
    this.leaderboardName = options.leaderboardName ?? 'vge_leaderboard_scores';
  }

  async init(): Promise<void> {
    this.player = await this.sdk.getPlayer({ scopes: false });
    this.leaderboard = await this.sdk.getLeaderboards();
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

  async saveData(data: TSaveData): Promise<boolean> {
    if (!this.player) return false;

    try {
      await this.player.setData({
        [this.storageKey]: JSON.stringify(data)
      }, true);
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
        onOffline: () => resolve()
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
        onError: () => resolve(false)
      });
    });
  }

  async setLeaderboardScore(score: number): Promise<void> {
    if (!this.leaderboard) return;

    try {
      await this.leaderboard.setLeaderboardScore(this.leaderboardName, score);
    } catch {
      return;
    }
  }

  async getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
    if (!this.leaderboard) return [];

    try {
      const result = await this.leaderboard.getLeaderboardEntries(this.leaderboardName, {
        includeUser: true,
        quantityAround: 5,
        quantityTop: 10
      });

      const currentPlayerID = this.player?.getUniqueID();

      return result.entries.map((entry) => ({
        rank: entry.rank,
        name: entry.player.publicName || 'Anonymous',
        score: entry.score,
        isPlayer: entry.player.uniqueID === currentPlayerID,
        photo: entry.player.avatarSrc
      }));
    } catch {
      return [];
    }
  }
}
