import {
  IPlatformService,
  LeaderboardEntry,
  ILeaderboardsService,
} from './types';

/**
 * Supplies the two convenience methods every provider would otherwise repeat.
 *
 * `setLeaderboardScore(score)` and `getLeaderboardEntries()` are the v1 API: one
 * unnamed board, a flat list of rows. They are kept because games shipped
 * against them, and they are implemented here — once — on top of the full
 * `getLeaderboards()` surface, so a provider only has to get the real thing
 * right. Both swallow failures, exactly as the v1 implementations did: a
 * scoreboard that cannot be reached is not a reason to interrupt play.
 *
 * Extending this class is also the shortest migration for a custom provider
 * written against v1 — implement `getLeaderboards()` and `currentPlayerId()`,
 * and the rest keeps working.
 */
export abstract class BasePlatformService<TSaveData = unknown>
  implements IPlatformService<TSaveData>
{
  protected constructor(protected readonly defaultLeaderboardName: string) {}

  abstract init(): Promise<void>;
  abstract getPlayerName(): string;
  abstract getLanguage(): string;
  abstract saveData(data: TSaveData): Promise<boolean>;
  abstract loadData(): Promise<TSaveData | null>;
  abstract showInterstitial(): Promise<void>;
  abstract showRewardedAd(): Promise<boolean>;
  abstract getLeaderboards(): Promise<ILeaderboardsService>;

  /** The current player's platform id, used to flag their own row. */
  protected abstract currentPlayerId(): string | null;

  async setLeaderboardScore(score: number): Promise<void> {
    try {
      const leaderboards = await this.getLeaderboards();
      await leaderboards.setLeaderboardScore(this.defaultLeaderboardName, score);
    } catch {
      return;
    }
  }

  async getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
    try {
      const leaderboards = await this.getLeaderboards();
      const result = await leaderboards.getLeaderboardEntries(this.defaultLeaderboardName, {
        includeUser: true,
        quantityAround: 5,
        quantityTop: 10,
      });
      const playerId = this.currentPlayerId();
      return result.entries.map((entry) => {
        const photo = entry.player.getAvatarSrc('small');
        return {
          rank: entry.rank,
          name: entry.player.publicName || 'Anonymous',
          score: entry.score,
          isPlayer: playerId !== null && entry.player.uniqueID === playerId,
          ...(photo ? { photo } : {}),
        };
      });
    } catch {
      return [];
    }
  }
}
