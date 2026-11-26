import { describe, expect, it } from "vitest";
import {
  GEOGRAPHIC_JOB_MAX_ATTEMPTS, GEOGRAPHIC_JOB_LEASE_SECONDS,
  geographicJobRetryStatus, geographicJobRetryDelayMinutes,
} from "@/domain/geographic-job-policy";

describe("geographic queue retry policy", () => {
  it("preserves the existing four-attempt and two-minute lease limits", () => {
    expect(GEOGRAPHIC_JOB_MAX_ATTEMPTS).toBe(4);
    expect(GEOGRAPHIC_JOB_LEASE_SECONDS).toBe(120);
  });

  it.each([[0, 1], [1, 2], [2, 4], [3, 8], [4, 16], [5, 32], [6, 60], [100, 60]])(
    "preserves bounded backoff for attempt %i", (attempts, minutes) => {
      expect(geographicJobRetryDelayMinutes(attempts)).toBe(minutes);
    },
  );

  it.each([0, 1, 2, 3])("permits retry before the limit: %i", attempts => {
    expect(geographicJobRetryStatus(attempts)).toBe("pending");
  });

  it.each([4, 5, 100])("marks exhausted attempts terminal: %i", attempts => {
    expect(geographicJobRetryStatus(attempts)).toBe("failed");
  });
});
