import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { publisherReleaseAvailableForAdoption } from "@/domain/native-offering-adoption-publication";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("independently governed publisher release → local adoption",()=>{
  const published={lifecycle:"published",publishedAt:new Date("2026-11-17T16:00:00Z"),
    offeringStatus:"active"};

  it("recognizes only an active, timestamped published publisher version",()=>{
    expect(publisherReleaseAvailableForAdoption(published)).toBe(true);
    expect(publisherReleaseAvailableForAdoption({...published,lifecycle:"draft"})).toBe(false);
    expect(publisherReleaseAvailableForAdoption({...published,publishedAt:null})).toBe(false);
    expect(publisherReleaseAvailableForAdoption({...published,offeringStatus:"suspended"})).toBe(false);
    expect(publisherReleaseAvailableForAdoption({...published,offeringStatus:"draft"})).toBe(false);
  });

  it("the authorized queue reads the same exact-version fields as the mutation",()=>{
    const service=read("src/modules/programs/native-offering-adoption-review.functions.ts");
    expect(service).toContain("publishedAt:offeringVersions.publishedAt");
    expect(service).toContain("offeringStatus:offerings.status");
    expect(service).toContain("publisherReleaseAvailableForAdoption({");
    expect(service).toContain("revalidateReviewer(tx,request,actor)");
    expect(service).toContain('assertCapability(actor,"blueprint.review")');
    expect(service).toContain("await verifiedEvidence(tx,data.evidenceVersionId)");
  });

  it("renders a V6.1 blocker and disables approval while publisher release is missing",()=>{
    const ui=read("src/components/launch-studio/NativeOfferingAdoptionReviewPanel.tsx");
    expect(ui).toContain("publisherReleaseAvailableForAdoption(item)");
    expect(ui).toContain("!publisherReleaseReady||feedback.pending||feedback.refreshFailed");
    expect(ui).toContain('!publisherReleaseReady&&<WorkspaceNotice tone="attention"');
    expect(ui).toContain("<MutationFeedback state={feedback}");
    expect(ui).toContain("invalidateNativeClassAvailability(client)");
    expect(ui).not.toContain("setNotice(");
  });

  it("Class launch readiness navigates to existing independently authorized workspaces",()=>{
    const ui=read("src/components/learning/NativeClassLaunchReadiness.tsx");
    const route=read("src/routes/canonical.blueprints.tsx");
    const publisher=read("src/components/learning/ProviderInstructionReviews.tsx");
    expect(ui).toContain('to="/class" search={{view:"reviews"}}');
    expect(ui).toContain('to="/canonical/blueprints"');
    expect(route).toContain("<NativeOfferingAdoptionReviewPanel/>");
    expect(publisher).toContain("<NativeOfferingReleaseReviewPanel/>");
    expect(ui).not.toContain("createUnifiedClassDraft");
    expect(ui).not.toContain("approveNativeOfferingAdoption");
  });
});
