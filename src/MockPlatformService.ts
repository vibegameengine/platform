import { IPlatformService, LeaderboardEntry } from './types';

export interface MockPlatformOptions {
  storageKey?: string;
  languageKey?: string;
  highScoreKey?: string;
  adDurationMs?: number;
  initDelayMs?: number;
  loadDelayMs?: number;
  playerName?: string;
  mockNames?: string[];
}

const DEFAULT_MOCK_NAMES = ['CyberNinja', 'NeonRider', 'PixelKing', 'VoxelViper', 'DataMiner', 'GlitchHunter'];

export class MockPlatformService<TSaveData = unknown> implements IPlatformService<TSaveData> {
  private readonly storageKey: string;
  private readonly languageKey: string;
  private readonly highScoreKey: string;
  private readonly adDurationMs: number;
  private readonly initDelayMs: number;
  private readonly loadDelayMs: number;
  private readonly mockNames: string[];
  private _playerName: string;

  constructor(options: MockPlatformOptions = {}) {
    this.storageKey = options.storageKey ?? 'vge_platform_save_v1';
    this.languageKey = options.languageKey ?? 'vge_platform_lang_v1';
    this.highScoreKey = options.highScoreKey ?? 'vge_platform_high_score_v1';
    this.adDurationMs = options.adDurationMs ?? 2000;
    this.initDelayMs = options.initDelayMs ?? 300;
    this.loadDelayMs = options.loadDelayMs ?? 150;
    this._playerName = options.playerName ?? 'DevPlayer';
    this.mockNames = options.mockNames ?? DEFAULT_MOCK_NAMES;
  }

  async init(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.initDelayMs));
  }

  getPlayerName(): string {
    return this._playerName;
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

  async setLeaderboardScore(score: number): Promise<void> {
    localStorage.setItem(this.highScoreKey, score.toString());
  }

  async getLeaderboardEntries(): Promise<LeaderboardEntry[]> {
    const playerHighScore = parseInt(localStorage.getItem(this.highScoreKey) || '0', 10);

    const entries: LeaderboardEntry[] = this.mockNames.map((name, i) => ({
      rank: i + 1,
      name,
      score: 100000 - (i * 5000) + Math.floor(Math.random() * 1000),
      isPlayer: false
    }));

    entries.push({
      rank: 99,
      name: this._playerName,
      score: playerHighScore,
      isPlayer: true
    });

    entries.sort((a, b) => b.score - a.score);
    return entries.map((entry, i) => ({ ...entry, rank: i + 1 }));
  }
}
