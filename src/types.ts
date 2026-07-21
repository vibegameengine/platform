export interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  isPlayer: boolean;
  photo?: string;
}

export interface IPlatformService<TSaveData = unknown> {
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
