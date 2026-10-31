import { afterEach, describe, expect, it, vi } from "vitest";
import scheduledJobs from "../../netlify/functions/scheduled-jobs";
import schoolFamilyAlerts from "../../netlify/functions/school-family-alerts";

const previousUrl = process.env.URL;
const previousSecret = process.env.CAN_JOB_SECRET;
afterEach(() => {
  if (previousUrl === undefined) delete process.env.URL;
  else process.env.URL = previousUrl;
  if (previousSecret === undefined) delete process.env.CAN_JOB_SECRET;
  else process.env.CAN_JOB_SECRET = previousSecret;
  vi.unstubAllGlobals();
});

describe("Netlify child-safety and family-delivery schedules", () => {
  it("fails visibly instead of skipping safeguarding maintenance when unconfigured", async () => {
    delete process.env.URL;
    delete process.env.CAN_JOB_SECRET;
    await expect(scheduledJobs()).rejects.toThrow(/maintenance was NOT executed/);
  });
  it("fails visibly instead of skipping urgent family alerts when unconfigured", async () => {
    delete process.env.URL;
    delete process.env.CAN_JOB_SECRET;
    await expect(schoolFamilyAlerts()).rejects.toThrow(/dispatch was NOT executed/);
  });
  it("propagates authenticated maintenance endpoint failures", async () => {
    process.env.URL = "https://can-os.example";
    process.env.CAN_JOB_SECRET = "test-only-secret";
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", {status:503}));
    vi.stubGlobal("fetch",fetchMock);
    await expect(scheduledJobs()).rejects.toThrow(/503/);
    await expect(schoolFamilyAlerts()).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
