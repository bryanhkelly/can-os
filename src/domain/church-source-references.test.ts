import { describe, expect, it } from "vitest";
import {
  initialChurchReferenceState,
  churchSuggestionTargetFields,
  normalizeChurchReferenceUrl,
} from "./church-source-references";

describe("church reference URLs", () => {
  it("preserves public church paths while dropping only known tracking parameters", () => {
    expect(normalizeChurchReferenceUrl(
      "website", "https://church.org/about?utm_source=ad&language=es#history",
    )).toBe("https://church.org/about?language=es");
  });

  it("preserves channel identity and platform query arguments", () => {
    expect(normalizeChurchReferenceUrl(
      "youtube", "https://www.youtube.com/@ExampleChurch?view=0&fbclid=123",
    )).toBe("https://www.youtube.com/@ExampleChurch?view=0");
  });

  it.each([
    ["website", "http://church.org"],
    ["website", "https://user:pass@church.org"],
    ["website", "https://localhost/admin"],
    ["website", "https://127.0.0.1"],
    ["website", "https://[::1]"],
    ["website", "https://church.org:8443"],
    ["website", "https://church.local"],
    ["instagram", "https://evil.example/instagram.com/profile"],
    ["facebook", "https://notfacebook.com/church"],
    ["tiktok", "https://instagram.com/church"],
    ["website", "javascript:alert(1)"],
  ] as const)("rejects unsupported or nonpublic %s reference %s", (kind, url) => {
    expect(() => normalizeChurchReferenceUrl(kind, url)).toThrow();
  });

  it("maps source excerpts only into locally editable church-owned fields", () => {
    expect(churchSuggestionTargetFields.church_history).toBe("churchHistory");
    expect(churchSuggestionTargetFields.church_mission).toBe("localDescription");
    expect(churchSuggestionTargetFields.local_community).toBe("communityOutreach");
    expect(churchSuggestionTargetFields.faith_and_values).toBe("statementOfFaith");
    expect(churchSuggestionTargetFields.branding_hint).toBeUndefined();
    expect(Object.values(churchSuggestionTargetFields)).not.toContain("tuition");
    expect(Object.values(churchSuggestionTargetFields)).not.toContain("admissions");
  });

  it("never treats a saved social link as extracted material", () => {
    expect(initialChurchReferenceState("youtube")).toBe("unsupported");
    expect(initialChurchReferenceState("instagram")).toBe("unsupported");
    expect(initialChurchReferenceState("facebook")).toBe("unsupported");
    expect(initialChurchReferenceState("tiktok")).toBe("unsupported");
    expect(initialChurchReferenceState("website")).toBe("saved");
  });
});
