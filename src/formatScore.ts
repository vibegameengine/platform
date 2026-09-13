import { LeaderboardScoreType } from './types';

/**
 * Renders a raw leaderboard score the way the platform does, so a game can
 * format a score it has not submitted yet — a running total, a personal best
 * held locally — and have it read identically to the board beside it.
 *
 * The stored value is always an integer; `decimalOffset` says where the decimal
 * point belongs. A racing game stores 12345 on a `time` board with offset 2 and
 * shows `2:03.45`.
 */
export function formatScore(
  score: number,
  type: LeaderboardScoreType = 'numeric',
  decimalOffset = 0,
): string {
  const negative = score < 0;
  const magnitude = Math.abs(Math.trunc(score));
  const unit = 10 ** decimalOffset;
  const whole = Math.trunc(magnitude / unit);
  const fraction = magnitude % unit;

  const body = type === 'time' ? formatDuration(whole) : groupThousands(whole);
  const text = decimalOffset > 0 ? `${body}.${String(fraction).padStart(decimalOffset, '0')}` : body;
  return negative ? `-${text}` : text;
}

/** `h:mm:ss` once there are hours, `m:ss` below that — never a leading `0:00:`. */
function formatDuration(totalSeconds: number): string {
  const hours = Math.trunc(totalSeconds / 3600);
  const minutes = Math.trunc((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** `1234567` → `1 234 567`. A plain space, so the value stays copy-pasteable. */
function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
