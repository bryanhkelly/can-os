import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupStudentMembershipPanel } from "./GroupStudentMembershipPanel";
import { GroupSessionsPanel } from "./GroupSessionsPanel";
import { GroupDiscussionPanel } from "./GroupDiscussionPanel";
import { GroupMembersPanel } from "./GroupMembersPanel";
import { GroupReportsPanel } from "./GroupReportsPanel";
import type { GroupPanelRecord, GroupPanelAvailability, GroupPanelMutation } from "./group-panel-contracts";

const group = {
  id:"group-1", title:"Study group",timezone:"UTC",
  membershipStatus:null,sessions:[],roster:[],posts:[],reports:[],pendingMembers:[],
} as unknown as GroupPanelRecord;
const availability={
  writesEnabled:false,membershipEnabled:false,moderationEnabled:false,contentEnabled:false,
} as unknown as GroupPanelAvailability;
const mutation = {
  pending:false,refreshFailed:false,error:null,status:"idle",
} as unknown as GroupPanelMutation;
const run=async()=>{};

describe("shared study group interaction panels", () => {
  it("requires guardian linkage before a student can request membership", () => {
    const html=renderToStaticMarkup(<GroupStudentMembershipPanel group={group}
      availability={availability} hasEnrollmentGuardian={false} busy={false} run={run}/>);
    expect(html).toContain("A linked guardian is required");
    expect(html).toContain("Request to join");
    expect(html).toContain("disabled");
  });
  it("does not imply a scheduled session exists", () => {
    const html=renderToStaticMarkup(<GroupSessionsPanel group={group} role="student"
      availability={availability} busy={false} run={run}
      mutation={mutation}/>);
    expect(html).toContain("No sessions scheduled");
    expect(html).not.toContain("Present");
  });
  it("hides discussion content before membership approval", () => {
    const html=renderToStaticMarkup(<GroupDiscussionPanel group={{
      ...group,posts:[{id:"private-1",body:"Protected post"}],
    } as GroupPanelRecord} role="student"
      approvedMember={false} availability={availability} busy={false}
      run={run} mutation={mutation}/>);
    expect(html).toContain("visible to approved group members");
    expect(html).not.toContain("Protected post");
  });
  it("does not allow a facilitator to approve a pending member without guardian consent", () => {
    const pending = {...group,pendingMembers:[{
      id:"request-1",studentPersonId:"person-1",studentName:"Learner",
      guardianReady:false,
    }]} as GroupPanelRecord;
    const html=renderToStaticMarkup(<GroupMembersPanel group={pending}
      availability={{...availability,membershipEnabled:true}}
      busy={false} run={run}/>);
    expect(html).toContain("Awaiting guardian permission");
    expect(html).toContain("Approve");
    expect(html).toContain("disabled");
  });
  it("shows an empty moderation queue rather than an invented resolution", () => {
    const html=renderToStaticMarkup(<GroupReportsPanel
      group={group} availability={availability} busy={false} run={run}/>);
    expect(html).toContain("No open content reports");
  });
});
