import { describe, expect, it } from "vitest";
import { emptySiteStoryV61 } from "./site-information-v61";
import { suggestWebsiteCopyFromStory } from "./site-website-story-suggestions";
import { siteLocalContentLimits } from "./site-local-content";

describe("private website copy candidates", () => {
  it("returns no invented story for empty information", () =>
    expect(suggestWebsiteCopyFromStory(emptySiteStoryV61(), "Example")).toEqual([]));
  it("uses only selected choices and never exposes private founding narratives", () => {
    const story = { ...emptySiteStoryV61(), values:["service"] as ["service"],
      motivations:["belonging"] as ["belonging"], foundingStory:"Private person Jane Roe",
      communityNeed:"Sensitive contact information", futureVision:"Private family background" };
    const options = suggestWebsiteCopyFromStory(story,"Our Site");
    expect(options.length).toBeGreaterThan(2);
    expect(JSON.stringify(options)).not.toContain("Jane Roe");
    expect(JSON.stringify(options)).not.toContain("Sensitive contact");
    for (const candidate of options)
      expect(candidate.text.length).toBeLessThanOrEqual(siteLocalContentLimits[candidate.field]);
  });
});
