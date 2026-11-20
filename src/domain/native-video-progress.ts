/** Optional per-browser native-video resume/coverage observations.
 * Never official course progress, attendance, or evidence of mastery.
 * Do not store signed URLs or student identifiers in the payload.
 */
export type NativeVideoProgress = {
  position: number;
  duration: number;
  ranges: [number, number][];
  updatedAt: number;
};
const MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const MAX_RANGES = 256;

export function normalizeNativeVideoProgress(value: unknown, now = Date.now()): NativeVideoProgress | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const valid = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
  if (!valid(data.duration) || data.duration <= 0 || data.duration > 24 * 60 * 60 ||
      !valid(data.position) || data.position < 0 || data.position > data.duration ||
      !valid(data.updatedAt) || data.updatedAt > now + 60_000 ||
      now - data.updatedAt > MAX_AGE || !Array.isArray(data.ranges) ||
      data.ranges.length > MAX_RANGES) return null;
  const ranges: [number, number][] = [];
  for (const pair of data.ranges) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
        !valid(pair[0]) || !valid(pair[1]) ||
        pair[0] < 0 || pair[1] > data.duration || pair[1] <= pair[0]) return null;
    ranges.push([pair[0], pair[1]]);
  }
  return { position: data.position, duration: data.duration, updatedAt: data.updatedAt, ranges: coalesce(ranges) };
}
function coalesce(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1] + 0.05) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged.slice(-MAX_RANGES);
}
/** Reject backward/large seeks; a change in playback position is not viewing. */
export function advanceNativeVideoProgress(
  previous: NativeVideoProgress | null,
  from: number, to: number, duration: number,
  elapsedWallSeconds: number, playing: boolean, now = Date.now(),
): NativeVideoProgress | null {
  if (![from,to,duration,elapsedWallSeconds].every(Number.isFinite) ||
      duration <= 0 || duration > 86_400 || to < 0 || to > duration ||
      elapsedWallSeconds < 0) return null;
  const ranges = previous && Math.abs(previous.duration - duration) < 1 ? previous.ranges : [];
  // Only record bounded, continuously advancing foreground media. A seek
  // across unobserved content must not count toward coverage.
  const delta = to - from;
  const observed = playing && delta > 0 && elapsedWallSeconds > 0 &&
    delta <= Math.max(2, elapsedWallSeconds * 2.5) && elapsedWallSeconds <= 10;
  return {
    position: to, duration, updatedAt: now,
    ranges: observed ? coalesce([...ranges,[from,to]]) : ranges,
  };
}
export function nativeVideoCoverage(progress: NativeVideoProgress | null): number {
  if (!progress) return 0;
  return Math.min(100, Math.floor(progress.ranges.reduce((n,[start,end])=>n+end-start,0)/progress.duration*100));
}
