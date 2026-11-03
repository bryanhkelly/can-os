import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccessContext } from "@/domain/access-context";

const state = vi.hoisted(() => ({
  transaction: vi.fn(),
  extraction: vi.fn(),
}));
vi.mock("@/db/client", () => ({
  db: { transaction: state.transaction },
}));
vi.mock("./church-public-web-fetch.server", () => ({
  extractChurchPublicWebsite: state.extraction,
}));

import { refreshChurchWebsiteSuggestions } from "./church-content-suggestions.server";

const original = process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED;
  else process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED = original;
  state.transaction.mockClear();
  state.extraction.mockClear();
});

describe("church extraction release gate", () => {
  it("does not authorize a DB lookup or network fetch when the feature flag is absent", async () => {
    delete process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED;
    const result = await refreshChurchWebsiteSuggestions({} as AccessContext);
    expect(result.status).toBe("unsupported");
    expect(result.count).toBe(0);
    expect(result.message).toMatch(/not enabled/i);
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.extraction).not.toHaveBeenCalled();
  });

  it("does not interpret 'false', '1', or arbitrary values as permission to fetch", async () => {
    for (const flag of ["false", "1", "TRUE", "yes"]) {
      process.env.CAN_CHURCH_WEBSITE_DISCOVERY_ENABLED = flag;
      const result = await refreshChurchWebsiteSuggestions({} as AccessContext);
      expect(result.status).toBe("unsupported");
    }
    expect(state.transaction).not.toHaveBeenCalled();
    expect(state.extraction).not.toHaveBeenCalled();
  });
});
