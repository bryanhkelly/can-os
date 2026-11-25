import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync(new URL("../../src/routes/class.tsx", import.meta.url), "utf8");

function card(name:string) {
  expect(route).toContain("<"+name);
  return readFileSync(new URL("../../src/components/learning/native-class/"+name+".tsx",import.meta.url),"utf8");
}

function component(from: string, until: string) {
  const start = route.indexOf(from);
  const end = route.indexOf(until, start);
  if (start < 0 || end <= start) throw new Error("Missing native Class workflow " + from);
  return route.slice(start, end);
}

describe("native Class command reconciliation", () => {
  it.each([
    ["OfferingCard", "onJoined"],
    ["ApprovedClassCard", "onChanged"],
    ["InvitationCard", "onChanged"],
    ["EnrolledClassCard", "onChanged"],
  ])("%s separates persisted command success from refresh errors", (name, refresh) => {
    const source = card(name);
    expect(source).toContain(`useMutationFeedback(${refresh})`);
    expect(source).toContain("mutation.pending||mutation.refreshFailed");
    expect(source).toContain("mutation.run(");
    expect(source).toContain("refreshErrorMessage:");
    expect(source).toContain("MutationFeedback state=");
    expect(source).toContain("retryRefresh:mutation.retryRefresh");
    // Refresh is provided only to the shared mutation runner, never inside
    // the command's catch block (which would misreport saved commands as failed).
    expect(source).not.toContain(`await ${refresh}()`);
  });

  it("keeps the learner's different server commands independent", () => {
    const offering = card("OfferingCard");
    expect(offering).toContain("requestNativeClassApproval({data:");
    expect(offering).toContain("enrollCurrentPersonInClass({data:");
    expect(offering).toContain("result.duplicate?");
    expect(offering).toContain("result.alreadyEnrolled?");
    const approval = card("ApprovedClassCard");
    expect(approval).toContain("approvalRequestId:item.approvalRequestId");
    const invitation = card("InvitationCard");
    expect(invitation).toContain("invitationId:item.invitationId");
    expect(invitation).toContain("declineNativeClassInvitation({data:");
    expect(invitation).toContain("!item.consentText||busy");
  });

  it("keeps refresh failures observable for all dependent query invalidations", () => {
    const refresh = component(
      "  async function refresh(){",
      "  async function recoverExistingNativeLearning(){",
    );
    expect(refresh.match(/throwOnError:true/g)).toHaveLength(5);
    for (const key of [
      "native-public-class-catalog",
      "native-my-class-enrollment-history",
      "native-my-class-invitations",
      "native-my-class-approvals",
      "my-activity",
    ]) expect(refresh).toContain(`client.invalidateQueries({queryKey:["${key}"`);
  });
});
