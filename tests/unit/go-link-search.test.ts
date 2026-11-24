import { describe, expect, it } from "vitest";
import { goLikeContainsLiteral } from "@/domain/go-link-search";
import { goDestinationKinds, goDestinationKindSchema, goDestinationLabels,
  goDestinationSchema } from "@/domain/site-go-links";

describe("Go Link shared input and search contracts",()=>{
  it("escapes PostgreSQL LIKE wildcard tokens rather than treating them as patterns",()=>{
    expect(goLikeContainsLiteral("  AI skills  ")).toBe("%AI skills%");
    expect(goLikeContainsLiteral("50%")).toBe("%50\\%");
    expect(goLikeContainsLiteral("A_B")).toBe("%A\\_B%");
    expect(goLikeContainsLiteral("\\")).toBe("%\\\\%");
    expect(goLikeContainsLiteral("x".repeat(95))).toHaveLength(82);
  });
  it("unifies every authorable Go destination kind between UI and server",()=>{
    expect(goDestinationKindSchema.options).toEqual(goDestinationKinds);
    for(const kind of goDestinationKinds){
      expect(goDestinationLabels[kind].length).toBeGreaterThan(0);
    }
    expect(goDestinationSchema.options).toHaveLength(goDestinationKinds.length);
  });
});
