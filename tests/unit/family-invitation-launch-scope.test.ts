import { describe, expect, it } from "vitest";
import { familyInvitationLaunchScope } from "../../src/domain/family-invitation-launch-scope";
const school = { id: "school", name: "School", siteId: "site", publishedSiteUrl: "https://school.example.test", purpose: "application" as const };
const other = { ...school, id: "other", siteId: "other-site" };
function batch(programId: string, siteId: string) {
  return { id: programId, programId, siteId, programName: "School", subject: "Invitation",
    introduction: "Welcome", createdAt: "2026-10-29T12:00:00Z", status: "queued" as const, purpose: "application" as const,
    outboxStatus: "pending" as const, recipients: [] };
}
const workspace = { programs: [school, other], batches: [batch(school.id, school.siteId), batch(other.id, other.siteId)] };
describe("family invitations remain in the active launch", () => {
  it("does not substitute a published neighbor for an ineligible launch", () => {
    const result = familyInvitationLaunchScope(workspace, { programId: "still-launching" });
    expect(result.programs).toEqual([]);
    expect(result.initialProgram).toBeUndefined();
    expect(result.batches).toEqual([]);
  });
  it("selects only the exact intended application and history", () => {
    const result = familyInvitationLaunchScope(workspace, { siteId: school.siteId, programId: school.id });
    expect(result.initialProgram).toEqual(school);
    expect(result.batches.map(batch=>batch.programId)).toEqual([school.id]);
  });
  it("denies a mismatched Program/Site pair instead of choosing another destination", () => {
    expect(familyInvitationLaunchScope(workspace, { siteId: other.siteId, programId: school.id }).programs).toEqual([]);
  });
  it("keeps history visible when a Program is no longer invitation-eligible", () => {
    const result = familyInvitationLaunchScope({ ...workspace, programs: [] }, { siteId: school.siteId, programId: school.id });
    expect(result.programs).toEqual([]);
    expect(result.batches).toHaveLength(1);
  });
  it("requires a choice when the unfiltered workspace has multiple Programs", () => {
    expect(familyInvitationLaunchScope(workspace, {}).initialProgram).toBeUndefined();
  });
  it("does not assign site-less historical evidence to a selected school", () => {
    const legacy = { ...batch(school.id, school.siteId), siteId: undefined };
    expect(familyInvitationLaunchScope({ programs: [], batches: [legacy] }, { siteId: school.siteId }).batches).toEqual([]);
  });
});

