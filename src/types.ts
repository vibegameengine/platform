/**
 * A leaderboard row reduced to what a scoreboard widget needs. Kept from v1 so
 * games written against the old two-method API keep compiling.
 */
export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isPlayer: boolean;
  photo?: string;
}

// --- leaderboards, shaped after the Yandex Games SDK -------------------------
// Every name below — including the snake_cased ones and the `appID` spelling —
// is Yandex's. They are reproduced exactly so a game already written against
// `ysdk.getLeaderboards()` can be pointed at another platform by swapping the
// provider, with no change to the code that reads the data.

export type LeaderboardScoreType = 'numeric' | 'time';

export type ScopePermission = 'allow' | 'forbid' | 'not_set';

export interface LeaderboardDescription {
  /** The platform's id for the game. */
  appID: string;
  /** Whether this is the board the game gets when it names none. */
  default: boolean;
  description: {
    /** false ⇒ a higher score is better. true ⇒ a lower one is. */
    invert_sort_order: boolean;
    score_format: { options: { decimal_offset: number } };
    type: LeaderboardScoreType;
  };
  name: string;
  /** Locale-keyed display titles, e.g. `{ en: 'High score', ru: 'Рекорды' }`. */
  title: Record<string, string>;
}

export interface LeaderboardEntryPlayer {
  uniqueID: string;
  publicName: string;
  lang: string;
  scopePermissions: { avatar: ScopePermission; public_name: ScopePermission };
  /** Empty string on a platform without avatars — never null, as on Yandex. */
  getAvatarSrc(size: string): string;
  getAvatarSrcSet(size: string): string;
}

export interface LeaderboardEntryDetails {
  score: number;
  extraData?: string;
  /** 1-based. */
  rank: number;
  player: LeaderboardEntryPlayer;
  /** The score as the platform formats it, decimal offset and all. */
  formattedScore: string;
}

/** A contiguous 0-based slice of the board that the answer covers. */
export interface LeaderboardRange {
  start: number;
  size: number;
}

export interface LeaderboardEntries {
  leaderboard: LeaderboardDescription;
  ranges: LeaderboardRange[];
  /** 1-based rank of the current player, or 0 when they have no entry. */
  userRank: number;
  entries: LeaderboardEntryDetails[];
}

export interface LeaderboardEntriesOptions {
  /** Include the current player and the rows around them. */
  includeUser?: boolean;
  /** Rows on *each* side of the player. Max 10. */
  quantityAround?: number;
  /** Rows from the top of the board. Max 20. */
  quantityTop?: number;
}

/**
 * The object Yandex's `ysdk.getLeaderboards()` resolves with, method for method.
 */
export interface ILeaderboardsService {
  getLeaderboardDescription(leaderboardName: string): Promise<LeaderboardDescription>;
  setLeaderboardScore(leaderboardName: string, score: number, extraData?: string): Promise<void>;
  getLeaderboardEntries(
    leaderboardName: string,
    options?: LeaderboardEntriesOptions,
  ): Promise<LeaderboardEntries>;
  /** Rejects with `LeaderboardPlayerNotPresentError` before the first score. */
  getLeaderboardPlayerEntry(leaderboardName: string): Promise<LeaderboardEntryDetails>;
}

/**
 * Thrown by `getLeaderboardPlayerEntry` when the player has never posted a
 * score. A distinct type rather than a bare Error, because "no entry yet" is an
 * ordinary state a game shows an empty row for, not a failure to report.
 */
export class LeaderboardPlayerNotPresentError extends Error {
  constructor(leaderboardName: string) {
    super(`No entry on leaderboard "${leaderboardName}" for the current player`);
    this.name = 'LeaderboardPlayerNotPresentError';
  }
}

export interface IPlatformService<TSaveData = unknown> {
  init(): Promise<void>;
  getPlayerName(): string;
  getLanguage(): string;
  saveData(data: TSaveData): Promise<boolean>;
  loadData(): Promise<TSaveData | null>;
  showInterstitial(): Promise<void>;
  showRewardedAd(): Promise<boolean>;
  /** The full, Yandex-shaped leaderboard surface: named boards, extraData, ranks. */
  getLeaderboards(): Promise<ILeaderboardsService>;
  /** Convenience over the provider's default board. Never throws. */
  setLeaderboardScore(score: number): Promise<void>;
  /** Convenience over the provider's default board. Never throws. */
  getLeaderboardEntries(): Promise<LeaderboardEntry[]>;
}
