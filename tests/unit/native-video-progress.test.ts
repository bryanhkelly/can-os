import { describe, expect, it } from "vitest";
import {
  advanceNativeVideoProgress, nativeVideoCoverage, normalizeNativeVideoProgress,
} from "@/domain/native-video-progress";

describe("native video observations", () => {
  const now = 1_700_000_000_000;
  it("observes continuous native playback and not jumps across a video", () => {
    const start = advanceNativeVideoProgress(null, 0, 2, 60, 2, true, now)!;
    expect(nativeVideoCoverage(start)).toBe(3);
    const seek = advanceNativeVideoProgress(start, 2, 52, 60, 1, true, now + 1000)!;
    expect(nativeVideoCoverage(seek)).toBe(3);
    const continued = advanceNativeVideoProgress(seek, 52, 54, 60, 2, true, now + 3000)!;
    expect(nativeVideoCoverage(continued)).toBe(6);
    expect(continued.position).toBe(54);
  });
  it("does not count paused, hidden, stalled or reversed playback", () => {
    const first = advanceNativeVideoProgress(null, 10, 13, 100, 3, false, now)!;
    expect(nativeVideoCoverage(first)).toBe(0);
    const backward = advanceNativeVideoProgress(first, 13, 9, 100, 2, true, now + 2000)!;
    expect(nativeVideoCoverage(backward)).toBe(0);
    const stale = advanceNativeVideoProgress(backward, 9, 15, 100, 30, true, now + 32_000)!;
    expect(nativeVideoCoverage(stale)).toBe(0);
  });
  it("rejects malformed or expired local progress", () => {
    expect(normalizeNativeVideoProgress({position:4,duration:20,ranges:[[0,4]],updatedAt:now},now)).toMatchObject({position:4});
    expect(normalizeNativeVideoProgress({position:4,duration:20,ranges:[[0,40]],updatedAt:now},now)).toBeNull();
    expect(normalizeNativeVideoProgress({position:4,duration:20,ranges:[[0,4]],updatedAt:now-31*24*60*60*1000},now)).toBeNull();
  });
  it("merges overlapping observations without double counting", () => {
    const one=advanceNativeVideoProgress(null,0,2,10,2,true,now)!;
    const two=advanceNativeVideoProgress(one,1,3,10,2,true,now+2000)!;
    expect(nativeVideoCoverage(two)).toBe(30);
  });
});
