import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route as Groups } from "@/routes/groups";
import { Route as GroupDetail } from "@/routes/groups_.$groupId";
import { Route as Action } from "@/routes/actions.$actionId";
import { Route as MissingWork } from "@/routes/teacher.missing-work";
import { Route as HealthReview } from "@/routes/operations.health-review";
import { Route as TransferRecords } from "@/routes/operations.transfer-records";
import { Route as Transcripts } from "@/routes/admissions.transcripts";

const state=vi.hoisted(()=>({search:{} as Record<string,unknown>,params:{} as Record<string,string>,data:null as unknown}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=>(options:object)=>({
    options,useSearch:()=>state.search,useLoaderData:()=>state.data,useParams:()=>state.params,
  }),
  useRouter:()=>({invalidate:vi.fn()}),
  useLocation:()=>({pathname:"/actions/action-1",searchStr:"",hash:""}),
  useNavigate:()=>vi.fn(),
  Link:({to,search,params,children,...props}:{
    to:string;search?:Record<string,string|undefined>;params?:Record<string,string>;children:ReactNode;
  })=>{
    const path=to.replace(/\$([^/]+)/g,(_,key:string)=>params?.[key]??key);
    const query=new URLSearchParams(Object.entries(search??{}).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
    return <a href={path+(query?"?"+query:"")} {...props}>{children}</a>;
  },
}));
vi.mock("@/components/shell/WorkspaceSession",()=>({
  useWorkspaceSession:()=>({session:null}),
}));
vi.mock("@/modules/study-groups/study-group-queries.functions",() => ({
  listFacilitatorGroupScopes:vi.fn(),listStudyGroupReviewQueue:vi.fn(),listStudyGroupReports:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-workspace.functions",()=>({
  getStudyGroupAvailability:vi.fn(),getCanonicalGroupWorkspace:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-membership.functions",()=>({
  createFacilitatedGroup:vi.fn(),decideCanonicalGroupMembership:vi.fn(),
  requestCanonicalGroupMembership:vi.fn(),leaveCanonicalGroup:vi.fn(),
  inviteCanonicalGroupMembers:vi.fn(),listCanonicalGroupInvitees:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-moderation.functions",()=>({
  resolveCanonicalGroupReport:vi.fn(),createCanonicalGroupPost:vi.fn(),reportCanonicalGroupPost:vi.fn(),
}));
vi.mock("@/modules/study-groups/canonical-sessions.functions",()=>({
  createCanonicalGroupSession:vi.fn(),reviseCanonicalGroupSession:vi.fn(),
  listCanonicalGroupAttendance:vi.fn(),recordCanonicalGroupAttendance:vi.fn(),
  rsvpCanonicalGroupSession:vi.fn(),
}));
vi.mock("@/modules/study-groups/facilitator-query.functions",()=>({getFacilitatorStudyGroups:vi.fn()}));
vi.mock("@/modules/actions/action-detail.functions",()=>({getActionDetail:vi.fn()}));
vi.mock("@/modules/learning/teacher-missing-work.functions",()=>({
  getTeacherMissingWork:vi.fn(),createMissingWorkFollowUp:vi.fn(),resolveMissingWorkFollowUp:vi.fn(),
}));
vi.mock("@/modules/health/guardian-health-updates.functions",()=>({
  listGuardianHealthReviews:vi.fn(),reviewGuardianHealthUpdate:vi.fn(),
}));
vi.mock("@/modules/enrollment/transfer-records-handoff.functions",()=>({
  listTransferRecordsHandoffs:vi.fn(),completeTransferRecordsHandoff:vi.fn(),
}));
vi.mock("@/modules/learning/report-cards.functions",()=>({
  issueTranscript:vi.fn(),listTranscriptIssuanceCandidates:vi.fn(),
}));

function render(route:{options:{component?:unknown}}){
  const Page=route.options.component;
  if(typeof Page!=="function")throw new Error("Missing component");
  return renderToStaticMarkup(<Page/>);
}
beforeEach(()=>{
  state.search={};
  state.params={};
  const session={id:"session",title:"Essay review",startsAt:"2030-01-01T18:00:00Z",endsAt:"2030-01-01T19:00:00Z",
    cancelled:false,attendance:[],rsvp:null,attended:null,agenda:"",location:""};
  state.data={ok:true,data:{
    availability:{enabled:true,writesEnabled:true,membershipEnabled:true,creationEnabled:true,contentEnabled:true,moderationEnabled:true},
    workspace:{role:"teacher",hasEnrollmentGuardian:null,sections:[],groups:[
      {id:"english",title:"English group",description:"Essay revision circle",kind:"course",maxMembers:20,memberCount:2,
        facilitatorName:"Pat Teacher",membershipStatus:null,timezone:"America/Los_Angeles",
        sessions:[session],posts:[],roster:[],
        pendingMembers:[{id:"m-english",studentPersonId:"student",studentName:"Jordan",guardianReady:true}],
        reports:[{id:"report",postId:"post",reason:"Review this post",postBody:"Reported post",postHidden:false}]},
      {id:"math",title:"Unrelated math group",description:"Math practice",kind:"course",maxMembers:20,memberCount:1,
        facilitatorName:"Pat Teacher",membershipStatus:null,timezone:"America/Los_Angeles",
        sessions:[],posts:[],roster:[],
        pendingMembers:[{id:"m-math",studentPersonId:"other",studentName:"Other student",guardianReady:false}],
        reports:[{id:"other-report",postId:"other-post",reason:"Other report",postBody:"Unrelated post",postHidden:false}]},
    ]},
  }};
});

describe("facilitator record navigation",()=>{
  it("links requests, moderation and group cards to the group's detail page",()=>{
    const html=render(Groups);
    expect(html.match(/href="\/groups\/english"/g)).toHaveLength(3);
    expect(html.match(/href="\/groups\/math"/g)).toHaveLength(3);
  });
  it("opens the requested group detail and highlights its requested session",()=>{
    state.params={groupId:"english"};
    state.search={session:"session"};
    const html=render(GroupDetail);
    expect(html).toContain("English group");
    expect(html).toContain("Reported post");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("All study groups");
    expect(html).not.toContain("Unrelated math group");
    expect(html).not.toContain("Unrelated post");
    expect(html).not.toContain("Other student");
  });
  it("does not replace unavailable groups or sessions with another selection",()=>{
    state.params={groupId:"missing"};
    const missingGroup=render(GroupDetail);
    expect(missingGroup).toContain("This group is unavailable");
    expect(missingGroup).not.toContain("Essay review");
    expect(missingGroup).not.toContain("Unrelated math group");
    state.params={groupId:"english"};
    state.search={session:"missing"};
    expect(render(GroupDetail)).toContain("This session is unavailable");
    expect(render(GroupDetail)).not.toContain('aria-current="true"');
  });
  it("preserves the session search parameter and rejects non-string selection values",()=>{
    const validate=GroupDetail.options.validateSearch;
    if(typeof validate!=="function")throw new Error("Missing search validator");
    expect(validate({group:"english",session:"session"})).toEqual({session:"session"});
    expect(validate({session:false})).toEqual({session:undefined});
  });
});

describe("read-only staff Action detail",()=>{
  it("connects authorized academic Actions to class work and calendar without resolving them",()=>{
    state.data={ok:true,data:{id:"follow-up",title:"Review learning",status:"open",priority:"normal",
      type:"academic_intervention",sectionId:"english",canReviewClass:true,canManageOperations:false,
      workspaceHome:"/home",dueAt:null,resolvedAt:null,resolutionNote:null}};
    const html=render(Action);
    expect(html).toContain('href="/classes?section=english"');
    expect(html).toContain('href="/teacher/gradebook?section=english"');
    expect(html).toContain('href="/calendar?section=english"');
    expect(html).not.toContain("Open owning operations workflow");
  });
  it("preserves exact transcript-candidate identity even when names are identical",()=>{
    state.search={query:"Jordan"};
    state.data={ok:true,data:{candidates:[
      {studentPersonId:"first-student",studentName:"Jordan Student",recordCount:1,issuer:{name:"First issuer"}},
      {studentPersonId:"second-student",studentName:"Jordan Student",recordCount:2,issuer:{name:"Second issuer"}},
    ]}};
    expect(render(Transcripts)).toContain('href="/admissions/transcripts?query=Jordan&amp;student=first-student" class="underline">Jordan Student</a>');
    state.search={query:"Jordan",student:"second-student"};
    const selected=render(Transcripts);
    expect(selected).toContain("Second issuer");
    expect(selected).not.toContain("First issuer");
    state.search={query:"Jordan",student:"missing"};
    const unavailable=render(Transcripts);
    expect(unavailable).toContain("This transcript candidate is unavailable");
    expect(unavailable).not.toContain("Issue official transcript");
  });
  it("opens confidential health reviews by exact Action rather than a broader student profile",()=>{
    state.data={ok:true,data:[{id:"health-review",studentName:"Jordan Student",requestedAt:"2030-01-01"}]};
    expect(render(HealthReview)).toContain('href="/operations/health-review?action=health-review" class="underline">Jordan Student</a>');
    state.search={action:"missing"};
    const html=render(HealthReview);
    expect(html).toContain("not available for review");
    expect(html).not.toContain("Jordan Student");
  });
  it("selects exact transfer handoffs without falling back to another student's record",()=>{
    state.data={ok:true,data:{items:[
      {id:"handoff",studentName:"Jordan Student",status:"resolved",issuedTranscriptId:"transcript"},
      {id:"other-handoff",studentName:"Casey Student",status:"resolved",issuedTranscriptId:"other-transcript"},
    ]}};
    expect(render(TransferRecords)).toContain('href="/operations/transfer-records?action=handoff" class="underline">Jordan Student</a>');
    state.search={action:"handoff"};
    expect(render(TransferRecords)).not.toContain("Casey Student");
    state.search={action:"missing"};
    const unavailable=render(TransferRecords);
    expect(unavailable).toContain("This records handoff is unavailable");
    expect(unavailable).not.toContain("Jordan Student");
  });
  it("links missing-work assignment, student and course names to their own records",()=>{
    state.data={ok:true,data:{connected:true,items:[{
      assessmentId:"essay",title:"Evidence essay",course:"English",sectionId:"english",
      dueAt:"2030-01-01T12:00:00Z",studentProfileId:"student-profile",
      studentPersonId:"student-person",studentName:"Jordan Student",status:"not_started",
    }]}};
    const html=render(MissingWork);
    expect(html).toContain('href="/teacher/gradebook?section=english&amp;assessment=essay" class="underline">Evidence essay</a>');
    expect(html).toContain('href="/staff/students/student-person" class="underline">Jordan Student</a>');
    expect(html).toContain('href="/classes?section=english" class="underline">English</a>');
    expect(html).not.toContain('/staff/students/student-profile');
  });
  function action(canManageOperations:boolean,status="open"){
    state.data={ok:true,data:{
      id:"action",title:"Review missing work",description:"Meet the student",type:"academic_intervention",
      status,priority:"high",dueAt:"2030-01-01",resolvedAt:null,resolutionNote:null,
      siteId:"site",programId:"program",canManageOperations,
      workspaceHome:canManageOperations?"/home":"/home",
    }};
    return render(Action);
  }
  it("shows the selected record without exposing registrar commands to other staff",()=>{
    const html=action(false);
    expect(html).toContain("Review missing work");
    expect(html).toContain("Meet the student");
    expect(html).not.toContain('href="/home?action=');
    expect(html).not.toContain("Mark complete");
    expect(html).toContain('href="/home" class="underline">Back to workspace</a>');
  });
  it("allows a teacher to record and resolve only an owned open missing-work follow-up",()=>{
    state.data={ok:true,data:{
      id:"follow-up",title:"Overdue essay",type:"missing_work_follow_up",
      description:"Student has not submitted",status:"open",priority:"normal",
      dueAt:null,resolvedAt:null,resolutionNote:null,sectionId:"english",
      siteId:"site",programId:"program",canReviewClass:true,
      canResolveMissingWork:true,canManageOperations:false,
      workspaceHome:"/teacher/missing-work",
    }};
    const html=render(Action);
    expect(html).toContain('href="/teacher/missing-work"');
    expect(html).toContain("Resolve this follow-up");
    expect(html).toContain("Resolution note");
    expect(html).toContain("Resolve follow-up");
    expect(html).toContain('href="/classes?section=english"');
    expect(html).not.toContain("Open owning operations workflow");
    state.data={ok:true,data:{...state.data.data,status:"resolved"}};
    expect(render(Action)).not.toContain("Resolve this follow-up");
  });
  it("links active registrar work to the exact scoped owning workflow, not closed work",()=>{
    expect(action(true)).toContain('href="/home?action=action&amp;siteId=site&amp;programId=program"');
    expect(action(true,"resolved")).not.toContain("Open owning operations workflow");
  });
  it("renders unavailable records explicitly instead of displaying other Actions",()=>{
    state.data={ok:false,kind:"authorization",authError:"This action is unavailable in your current staff workspace.",
      message:"This action is unavailable in your current staff workspace."};
    const html=render(Action);
    expect(html).toContain("This action is unavailable");
    expect(html).not.toContain("Meet the student");
  });
});
