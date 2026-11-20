import { describe, expect, it } from "vitest";
import { readableBlueprintKey } from "./blueprint-display";

describe("Blueprint display labels",()=>{
  it("formats a code for display without changing the persisted key",()=>{
    const key="community_belonging";
    expect(readableBlueprintKey(key)).toBe("community belonging");
    expect(key).toBe("community_belonging");
  });
});
