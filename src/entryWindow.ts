import { LeaderboardRange } from './types';

export interface EntryWindowInput {
  /** Rows on the board. */
  total: number;
  /** 1-based rank of the current player, or 0 when they have none. */
  userRank: number;
  includeUser: boolean;
  quantityTop: number;
  /** Rows on *each* side of the player, so the block is 2n+1 at most. */
  quantityAround: number;
}

/**
 * Which slices of a board an answer covers — the platform's `ranges`.
 *
 * Exported because a provider written against this package has to reproduce it
 * to stay consistent with the hosted ones: at most two blocks, the top and a
 * window centred on the player, merged when they touch so no row is served
 * twice and `ranges` never contradicts `entries`.
 */
export function planRanges(input: EntryWindowInput): LeaderboardRange[] {
  const ranges: LeaderboardRange[] = [];

  const top = Math.min(input.quantityTop, input.total);
  if (top > 0) {
    ranges.push({ start: 0, size: top });
  }

  if (input.includeUser && input.userRank > 0) {
    const index = input.userRank - 1;
    const start = Math.max(0, index - input.quantityAround);
    const end = Math.min(input.total - 1, index + input.quantityAround);
    if (end >= start) {
      ranges.push({ start, size: end - start + 1 });
    }
  }

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: LeaderboardRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    // `<=` and not `<`: two blocks that merely touch are still one run of rows.
    if (last && range.start <= last.start + last.size) {
      last.size = Math.max(last.size, range.start + range.size - last.start);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}
