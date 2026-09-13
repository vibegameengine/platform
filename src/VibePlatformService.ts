import { BasePlatformService } from './BasePlatformService';
import {
  ILeaderboardsService,
  LeaderboardDescription,
  LeaderboardEntries,
  LeaderboardEntriesOptions,
  LeaderboardEntryDetails,
  LeaderboardEntryPlayer,
  LeaderboardPlayerNotPresentError,
  ScopePermission,
} from './types';

export interface VibePlatformOptions {
  /** Platform origin, e.g. `https://taply.games`. Defaults to the page's own. */
  baseUrl?: string;
  /** The game's slug. Read from a `/play/<slug>/` URL when omitted. */
  gameId?: string;
  /** The board the v1 `setLeaderboardScore(score)` shim writes to. */
  leaderboardName?: string;
  /** Display name proposed when this browser first mints an identity. */
  playerName?: string;
  storageKey?: string;
  tokenKey?: string;
  /** Injected in tests; defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
}

interface PlayerIdentity {
  playerId: string;
  token: string;
  displayName: string;
}

interface WirePlayer {
  uniqueID: string;
  publicName: string;
  lang: string;
  avatar: string | null;
  scopePermissions: { avatar: ScopePermission; public_name: ScopePermission };
}

interface WireEntry {
  score: number;
  extraData?: string;
  rank: number;
  player: WirePlayer;
  formattedScore: string;
}

/** An error the platform reported, with the machine code it sent alongside. */
export class VibePlatformError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VibePlatformError';
  }
}

/**
 * Provider for the Vibe Game Engine platform.
 *
 * Leaderboards are the part that matters: the platform's REST surface answers in
 * the Yandex Games SDK's own shapes, so `getLeaderboards()` here and on Yandex
 * hand a game the same objects.
 *
 * Two things the platform does not have yet, and this provider does not pretend
 * it does: there is no cloud save (`saveData`/`loadData` use `localStorage`, so
 * progress stays on the device) and no ad network (`showInterstitial` returns
 * at once and `showRewardedAd` grants the reward, so a game gated on a reward
 * stays playable).
 */
export class VibePlatformService<TSaveData = unknown> extends BasePlatformService<TSaveData> {
  private readonly baseUrl: string;
  private readonly storageKey: string;
  private readonly tokenKey: string;
  private readonly proposedName: string | undefined;
  private readonly fetchFn: typeof fetch;
  private readonly explicitGameId: string | undefined;

  private gameId = '';
  private identity: PlayerIdentity | null = null;
  private leaderboards: ILeaderboardsService | null = null;

  constructor(options: VibePlatformOptions = {}) {
    super(options.leaderboardName ?? 'vge_leaderboard_scores');
    this.baseUrl = (options.baseUrl ?? '').replace(/\/+$/, '');
    this.storageKey = options.storageKey ?? 'vge_platform_save_v1';
    this.tokenKey = options.tokenKey ?? 'vge_platform_player_token_v1';
    this.proposedName = options.playerName;
    this.explicitGameId = options.gameId;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  async init(): Promise<void> {
    this.gameId = this.explicitGameId ?? detectGameId();
    if (!this.gameId) {
      throw new Error(
        'VibePlatformService could not tell which game this is. Pass { gameId } explicitly.',
      );
    }
    this.identity = await this.restoreOrMintIdentity();
    this.leaderboards = this.buildLeaderboards();
  }

  getPlayerName(): string {
    return this.identity?.displayName || 'Player';
  }

  getLanguage(): string {
    const lang = typeof navigator === 'undefined' ? 'en' : navigator.language;
    return lang.slice(0, 2).toLowerCase();
  }

  async getLeaderboards(): Promise<ILeaderboardsService> {
    if (!this.leaderboards) {
      throw new Error('VibePlatformService.init() has not finished yet.');
    }
    return this.leaderboards;
  }

  protected currentPlayerId(): string | null {
    return this.identity?.playerId ?? null;
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
    try {
      const saved = localStorage.getItem(this.storageKey);
      return saved ? (JSON.parse(saved) as TSaveData) : null;
    } catch {
      return null;
    }
  }

  async showInterstitial(): Promise<void> {
    return;
  }

  async showRewardedAd(): Promise<boolean> {
    return true;
  }

  // --- leaderboards ---------------------------------------------------------

  private buildLeaderboards(): ILeaderboardsService {
    const path = (name: string, suffix = ''): string =>
      `/v1/games/${encodeURIComponent(this.gameId)}/leaderboards/${encodeURIComponent(name)}${suffix}`;

    return {
      getLeaderboardDescription: async (name): Promise<LeaderboardDescription> => {
        return this.request<LeaderboardDescription>(path(name));
      },

      setLeaderboardScore: async (name, score, extraData): Promise<void> => {
        await this.request(path(name, '/score'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(extraData === undefined ? { score } : { score, extraData }),
        });
      },

      getLeaderboardEntries: async (name, options): Promise<LeaderboardEntries> => {
        const query = buildQuery(options);
        const raw = await this.request<LeaderboardEntries & { entries: WireEntry[] }>(
          path(name, `/entries${query}`),
        );
        return { ...raw, entries: raw.entries.map(toEntry) };
      },

      getLeaderboardPlayerEntry: async (name): Promise<LeaderboardEntryDetails> => {
        try {
          return toEntry(await this.request<WireEntry>(path(name, '/player')));
        } catch (error) {
          // "Never posted a score" is an ordinary state, and the platform gives
          // it its own code so it can be told apart from a missing board.
          if (
            error instanceof VibePlatformError &&
            error.code === 'leaderboard_player_not_present'
          ) {
            throw new LeaderboardPlayerNotPresentError(name);
          }
          throw error;
        }
      },
    };
  }

  // --- identity and transport ----------------------------------------------

  private async restoreOrMintIdentity(): Promise<PlayerIdentity> {
    const stored = this.readStoredIdentity();
    if (stored) {
      return stored;
    }
    return this.mintIdentity();
  }

  private readStoredIdentity(): PlayerIdentity | null {
    try {
      const raw = localStorage.getItem(this.tokenKey);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (parsed.token && parsed.playerId) {
        return {
          token: parsed.token,
          playerId: parsed.playerId,
          displayName: parsed.displayName ?? 'Player',
        };
      }
    } catch {
      return null;
    }
    return null;
  }

  private async mintIdentity(): Promise<PlayerIdentity> {
    const response = await this.fetchFn(`${this.baseUrl}/v1/players/anonymous`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.proposedName ? { displayName: this.proposedName } : {}),
    });
    const body = await readBody(response);
    if (!response.ok) {
      throw toError(response.status, body);
    }
    const identity: PlayerIdentity = {
      playerId: String(body.playerId),
      token: String(body.token),
      displayName: String(body.displayName),
    };
    try {
      localStorage.setItem(this.tokenKey, JSON.stringify(identity));
    } catch {
      // A browser refusing storage costs this player their identity between
      // sessions; it must not cost them this session's scores.
    }
    return identity;
  }

  private async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const response = await this.fetchFn(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), ...this.authHeader() },
    });
    if (response.status === 401 && retry) {
      // The stored bearer expired or was revoked. Minting a fresh identity is
      // the only recovery, and it costs an anonymous player nothing.
      this.forgetIdentity();
      this.identity = await this.mintIdentity();
      return this.request<T>(path, init, false);
    }
    const body = await readBody(response);
    if (!response.ok) {
      throw toError(response.status, body);
    }
    return body as T;
  }

  private authHeader(): Record<string, string> {
    return this.identity ? { authorization: `Bearer ${this.identity.token}` } : {};
  }

  private forgetIdentity(): void {
    this.identity = null;
    try {
      localStorage.removeItem(this.tokenKey);
    } catch {
      // Nothing to do: the stale token is already out of memory.
    }
  }
}

/** `/play/<slug>/index.html` → `<slug>`. Empty when the page is somewhere else. */
function detectGameId(): string {
  if (typeof location === 'undefined') {
    return '';
  }
  return /^\/play\/([a-z0-9][a-z0-9-]*)\//.exec(location.pathname)?.[1] ?? '';
}

function buildQuery(options: LeaderboardEntriesOptions | undefined): string {
  if (!options) {
    return '';
  }
  const params = new URLSearchParams();
  if (options.includeUser !== undefined) {
    params.set('includeUser', String(options.includeUser));
  }
  if (options.quantityTop !== undefined) {
    params.set('quantityTop', String(options.quantityTop));
  }
  if (options.quantityAround !== undefined) {
    params.set('quantityAround', String(options.quantityAround));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * The wire carries an avatar URL; the SDK's shape carries the two accessors
 * Yandex exposes. A platform without avatars answers with an empty string, which
 * is what Yandex does for a player who has not consented to sharing one.
 */
function toEntry(entry: WireEntry): LeaderboardEntryDetails {
  const avatar = entry.player.avatar ?? '';
  const player: LeaderboardEntryPlayer = {
    uniqueID: entry.player.uniqueID,
    publicName: entry.player.publicName,
    lang: entry.player.lang,
    scopePermissions: entry.player.scopePermissions,
    getAvatarSrc: () => avatar,
    getAvatarSrcSet: () => avatar,
  };
  return {
    score: entry.score,
    ...(entry.extraData === undefined ? {} : { extraData: entry.extraData }),
    rank: entry.rank,
    player,
    formattedScore: entry.formattedScore,
  };
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { error: { code: 'bad_response', message: text.slice(0, 200) } };
  }
}

function toError(status: number, body: Record<string, unknown>): VibePlatformError {
  const error = body.error as { code?: string; message?: string } | undefined;
  return new VibePlatformError(
    error?.code ?? 'request_failed',
    error?.message ?? `Request failed with ${status}`,
    status,
  );
}
