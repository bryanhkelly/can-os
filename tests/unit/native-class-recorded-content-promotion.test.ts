import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getActiveWorkspacePath, workspaceLinks, getWorkspaceHome } from
  "@/components/shell/workspace-navigation.registry";

const read=(file:string)=>readFileSync(file,"utf8");

describe("recorded instruction is promoted into the single /class experience",()=>{
  it("routes verified creator and independent reviewer home to distinct Class views",()=>{
    expect(getWorkspaceHome("academic_content_creator")).toBe("/class?view=content");
    expect(getWorkspaceHome("academic_content_reviewer")).toBe("/class?view=reviews");
    expect(getActiveWorkspacePath(workspaceLinks.academic_content_creator,"/class")).toBe("/class?view=content");
    expect(getActiveWorkspacePath(workspaceLinks.academic_content_reviewer,"/class")).toBe("/class?view=reviews");
    const source=read("src/routes/home.tsx");
    expect(source).toContain('redirect({to:"/class",search:{view:"content"}})');
    expect(source).toContain('redirect({to:"/class",search:{view:"reviews"}})');
  });

  it("keeps retired recording and review routes absent",()=>{
    for(const path of [
      "src/routes/canonical.content.tsx",
      "src/routes/canonical.content_.$trackVersionId.tsx",
      "src/routes/canonical.content-reviews.tsx",
    ]) expect(existsSync(path)).toBe(false);
  });

  it("keeps original role and Course appointment checks in the source services",()=>{
    const service=read("src/modules/learning/provider-content-workspace.functions.ts");
    const grant=read("src/modules/learning/instructional-track-access.server.ts");
    expect(service).toContain("requireProviderContentRole");
    expect(service).toContain("assertTrackProvider");
    expect(grant).toContain("assertCurrentGrant");
    expect(grant).toContain("assignmentIsCurrentAndScoped");
    expect(grant).toContain("instructional_track.author");
    expect(grant).toContain("instructional_track.review");
  });

  it("uses one lazy production Class route with distinct creator and reviewer components",()=>{
    const home=read("src/routes/class.tsx");
    expect(home).toContain('value.view==="content"');
    expect(home).toContain('value.view==="reviews"');
    expect(home).toContain('trackVersionId:selectedClassUuid(value.trackVersionId)');
    expect(home).toContain('import("@/components/learning/ProviderInstructionHome")');
    expect(home).toContain('import("@/components/learning/ProviderInstructionDraft")');
    expect(home).toContain('import("@/components/learning/ProviderInstructionReviews")');
    const nav=read("src/components/learning/NativeClassHomeNavigation.tsx");
    expect(nav).toContain('canAuthorContent');
    expect(nav).toContain('canReviewContent');
    expect(nav).toContain('search={{view:"content"}}');
    expect(nav).toContain('search={{view:"reviews"}}');
  });

  it("retains actual draft, revision, independent review, and publication services",()=>{
    const home=read("src/components/learning/ProviderInstructionHome.tsx");
    const edit=read("src/components/learning/ProviderInstructionDraft.tsx");
    const review=read("src/components/learning/ProviderInstructionReviews.tsx");
    expect(home).toContain("createRecordedInstructionDraft");
    expect(edit).toContain("getCreatorInstructionalDraft");
    expect(edit).toContain("saveRecordedInstructionDraft");
    expect(edit).toContain("submitRecordedInstructionDraft");
    expect(review).toContain('academic_content_reviewer');
    expect(review).toContain("decideRecordedInstructionReview");
    expect(review).toContain("publishRecordedInstruction");
    expect(review).toContain("requiredKinds");
    for(const source of [home,edit,review]){
      expect(source).not.toContain("createFileRoute");
      expect(source).not.toContain("Route.useLoaderData");
    }
  });

  it("updates source queues after successful commands instead of using stale route loaders",()=>{
    expect(read("src/components/learning/ProviderInstructionHome.tsx"))
      .toContain('queryKey:["provider-content-home"]');
    expect(read("src/components/learning/ProviderInstructionDraft.tsx"))
      .toContain('client.invalidateQueries({queryKey:["provider-instruction-draft",data.trackVersionId]})');
    expect(read("src/components/learning/ProviderInstructionReviews.tsx"))
      .toContain('client.invalidateQueries({queryKey:["provider-content-review-queue"]})');
  });
});
