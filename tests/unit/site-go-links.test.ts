import { describe, expect, it } from "vitest";
import { goCodeSchema, goDestinationHref, goDestinationSelectionKey } from "@/domain/site-go-links";

const code = "K7x2p9AaB3cD";
const id = "11111111-1111-4111-8111-111111111111";
describe("site Go link routing", () => {
  it("uses canonical destination selection identity across property order and destination kinds", () => {
    expect(goDestinationSelectionKey({kind:"adult-training",releaseId:id})).toBe(
      goDestinationSelectionKey({releaseId:id,kind:"adult-training"}));
    expect(goDestinationSelectionKey({kind:"class",classId:id})).not.toBe(
      goDestinationSelectionKey({kind:"adult-training",releaseId:id}));
    const preview={kind:"website-preview" as const,snapshotId:id,snapshotDigest:"a".repeat(64),sourceRevision:1,brandVersionId:id};
    expect(goDestinationSelectionKey(preview)).not.toBe(goDestinationSelectionKey({...preview,sourceRevision:2}));
    expect(goDestinationSelectionKey(preview)).not.toBe(goDestinationSelectionKey({...preview,snapshotDigest:"b".repeat(64)}));
  });
  it("accepts only fixed-length opaque codes", () => {
    expect(goCodeSchema.safeParse(code).success).toBe(true);
    expect(goCodeSchema.safeParse("../admin").success).toBe(false);
    expect(goCodeSchema.safeParse("short").success).toBe(false);
  });
  it("routes published Site interest to the approved public contact page", () => {
    expect(goDestinationHref({ kind:"site-page", page:"contact" }, code, "oakland.can-os.com"))
      .toBe("https://oakland.can-os.com/contact");
    expect(goDestinationHref({ kind:"site-page", page:"contact" }, code)).toBeNull();
    expect(goDestinationHref({ kind:"site-page", page:"contact" }, code, "evil.com/path")).toBeNull();
  });
  it("routes an exact existing training and preserves bounded attribution", () => {
    expect(goDestinationHref({kind:"adult-training",releaseId:id},code))
      .toBe("/learn/enroll?release=" + id + "&ref=" + code);
  });
  it("routes Class and enrichment without claiming enrollment", () => {
    expect(goDestinationHref({kind:"class",classId:id},code)).toBe("/class?classId=" + id);
    expect(goDestinationHref({kind:"enrichment",seasonId:id},code)).toBe("/enrichment/" + id);
  });
  it("rejects arbitrary URLs, script protocols and unknown curated journeys", () => {
    expect(goDestinationHref({kind:"site-page",page:"//evil.com"},code,"oakland.can-os.com")).toBeNull();
    expect(goDestinationHref({kind:"url",target:"javascript:alert(1)"},code)).toBeNull();
    expect(goDestinationHref({kind:"information",journeyId:"unknown-journey"},code)).toBeNull();
  });
});
