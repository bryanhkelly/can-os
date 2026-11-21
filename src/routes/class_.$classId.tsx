import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/choice";
import { Label } from "@/components/ui/label";
import { DetailNavigation, SectionTab, WorkspaceShell, RosterList } from "@/components/workspace";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { UnifiedLessonOutline } from "@/components/learning/UnifiedLessonOutline";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { CourseLessonProgress } from "@/components/learning/CourseLessonProgress";
import { NativeClassSessionsPanel } from "@/components/learning/NativeClassSessionsPanel";
import { NativeClassActivationStatus } from "@/components/learning/NativeClassActivationStatus";
import { NativeClassroomCompanion } from "@/components/learning/NativeClassroomCompanion";
import { NativeClassCanonicalEvidencePanel } from "@/components/learning/NativeClassCanonicalEvidencePanel";
import { NativeClassHomeworkPanel } from "@/components/learning/NativeClassHomeworkPanel";
import { NativeClassKnowledgeCheckPanel } from "@/components/learning/NativeClassKnowledgeCheckPanel";
import { NativeClassTeacherHomeworkPanel, NativeClassTeacherAssessmentPanel } from
  "@/components/learning/NativeClassTeacherReviewPanels";
import { NativeClassDiscussionPanel } from "@/components/learning/NativeClassDiscussionPanel";
import { NativeClassLessonContentPanel } from "@/components/learning/NativeClassLessonContentPanel";
import { NativeClassAssessmentReviewPanel } from "@/components/learning/NativeClassAssessmentReviewPanel";
import { NativeClassRosterLifecycleAction } from "@/components/learning/NativeClassRosterLifecycleAction";
import { NativeClassSurveyCampaignPanel } from "@/components/learning/NativeClassSurveyCampaignPanel";
import { getNativeClassWorkspace, getNativeClassRosterPage } from "@/modules/classes/native-class-workspace.functions";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";
import { assignAdultToNativeClass } from "@/modules/classes/native-class-assignment.functions";
import { issueNativeClassInvitation } from "@/modules/classes/native-class-invitations.functions";
import {getNativeClassApprovalQueue,decideNativeClassApproval} from "@/modules/classes/native-class-approvals.functions";
import {listNativeClassRepeatCandidates,authorizeNativeClassRepeat} from "@/modules/classes/native-class-repeats.functions";
import { provisionNativeClassKnowledgeCheckAccess } from "@/modules/classes/native-class-assessment-provision.functions";
import {
  assignNativeClassStaff, endNativeClassStaffAssignment,
} from "@/modules/classes/class-staff.functions";
import { classViews, classTabs, type ClassView } from "@/domain/class-views";
import { normalizeClientError } from "@/lib/client-error";

/** Reuse the exact source-backed WS6 report inside the native Class,
 * loading its heavier analytics module only for authorized report views. */
const NativeClassReportPanel=lazy(async()=>{
  const report=await import("@/components/reports/NativeClassReportPanel");
  return {default:report.NativeClassReportPanel};
});

/** Governed completion review is Class-scoped, not a second admin page.
 * Service checks current reviewer, Site, independent evidence and policy. */
const NativeClassCompletionOperatorPanel=lazy(async()=>{
  const completion=await import("@/components/learning/NativeClassCompletionOperatorPanel");
  return {default:completion.NativeClassCompletionOperatorPanel};
});

const uuid=z.string().uuid();
const searchSchema=z.object({
  view:z.enum(classViews).optional(),
  tab:z.string().max(40).optional(),
  lesson:uuid.optional(),
  session:uuid.optional(),
}).strip();

export const Route=createFileRoute("/class_/$classId")({
  validateSearch:(raw:Record<string,unknown>)=>searchSchema.parse(raw),
  component:OneClassWorkspace,
});
type Workspace=Awaited<ReturnType<typeof getNativeClassWorkspace>>;

const tabLabels:Record<string,string>={
  overview:"Overview",lessons:"Lessons",assignments:"Assignments",assessments:"Knowledge checks",discussions:"Discussions",
  progress:"My progress",sessions:"Sessions",roster:"Roster",
  classroom:"Classroom",offering:"Class Offering",reports:"Reports",completion:"Completion",
};
const viewLabels:Record<ClassView,string>={
  learn:"Student",teach:"Teacher / Facilitator",manage:"Administration",
};

function ClassNavigation({workspace}:{workspace:Workspace}){
  return <div className="space-y-2">
    <DetailNavigation label="Class views" variant="record">
      {workspace.availableViews.map(view=><SectionTab key={view}
        current={view===workspace.view}
        link={{to:"/class/$classId",params:{classId:workspace.classId},
          search:{view,tab:undefined,lesson:undefined,session:undefined}}}>
        {viewLabels[view]}
      </SectionTab>)}
    </DetailNavigation>
    <DetailNavigation label="Class details" variant="record">
      {workspace.availableTabs.map(tab=><SectionTab key={tab}
        current={workspace.tab===tab}
        link={{to:"/class/$classId",params:{classId:workspace.classId},
          search:{view:workspace.view,tab,lesson:undefined,session:undefined}}}>
        {tabLabels[tab]??tab}
      </SectionTab>)}
    </DetailNavigation>
  </div>;
}
function OneClassWorkspace(){
  const {classId}=Route.useParams();
  const search=Route.useSearch();
  const workspace=useQuery({
    // Lesson and Session are URL-local selection, not authorization scope.
    // Omitting them avoids refetching the entire Class when navigating inside it.
    queryKey:["native-unified-class",classId,search.view,search.tab],
    queryFn:()=>getNativeClassWorkspace({data:{classId,view:search.view,tab:search.tab}}),retry:false,
  });
  if(workspace.isPending)return <WorkspaceShell width="wide" eyebrow="CAN OS · Class" title="Opening Class">
    <p role="status" className="mt-5 border border-border bg-card p-5 text-sm">
      Verifying your relationship, Class authority, and available workspace…
    </p>
  </WorkspaceShell>;
  if(workspace.isError||!workspace.data)return <WorkspaceShell width="wide" eyebrow="CAN OS · Class" title="Class unavailable">
    <p role="alert" className="mt-5 border border-border bg-card p-5 text-sm">
      You cannot open this Class view with your current verified relationship. Select an authorized Class or sign in with the appropriate grant.
    </p>
    <Link to="/class" search={{}} className="mt-4 inline-block text-sm font-semibold underline">
      Return to Classes
    </Link>
  </WorkspaceShell>;
  // Preserve the selected URL items for the view without a new server read.
  // The server still verifies the exact Person/Class relationship on a fresh
  // workspace request, and never uses these IDs to grant access.
  const data={...workspace.data,
    selectedLessonId:search.lesson??null,
    selectedSessionId:search.session??null,
  };
  if(data.view==="learn"){
    if(!data.learner) return null;
    return <LearnerClass key={data.learner.classEnrollmentId} workspace={data}/>;
  }
  if(data.view==="teach")return <TeachingClass workspace={data}/>;
  return <ManagingClass workspace={data}/>;
}
function LearnerClass({workspace}:{workspace:Workspace}){
  const learner=workspace.learner!;
  const record=useQuery({
    queryKey:["native-unified-class-progress",learner.classEnrollmentId],
    queryFn:()=>getNativeClassLearning({data:{classEnrollmentId:learner.classEnrollmentId}}),
    retry:false,
  });
  const data=record.data;
  const completed=data?.lessons.filter(x=>
    x.progressStatus==="completed"||x.progressStatus==="waived").length??0;
  return <UnifiedCoursePlayer context="native" title={workspace.title}
    subtitle="Your authorized Class workspace. Recorded teacher selection and progress belong to your own Course Attempt."
    actions={<Link to="/class" search={{}} className="text-sm font-semibold underline">All Classes</Link>}
    metadata={<>
      <span><strong>Enrollment:</strong> {learner.status}</span>
      <span><strong>Academic credit:</strong> {learner.creditMode.replaceAll("_"," ")}</span>
      <span><strong>Delivery:</strong> {workspace.deliveryMode.replaceAll("_"," ")}</span>
    </>}
    rail={<div className="space-y-4">
      <ClassNavigation workspace={workspace}/>
      <section className="border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">My progress</h2>
        {data?<div className="mt-3">
          <CourseLessonProgress completed={completed} total={data.lessons.length}
            ariaLabel="Individual lesson completion"
            description="Lesson activity is not a grade, attendance, or awarded credit."/>
        </div>:<p className="mt-3 text-xs text-muted-foreground">
          Your progress is being verified.
        </p>}
      </section>
      {data&&<section className="border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Published lessons</h2>
        <div className="mt-3 max-h-96 overflow-y-auto">
          <UnifiedLessonOutline selectedId={workspace.selectedLessonId}
            lessons={data.lessons.map(lesson=>({
              id:lesson.lessonId,title:lesson.lessonTitle,
              group:lesson.unitTitle,status:lesson.progressStatus,
            }))}
            renderAction={lesson=><Link to="/class/$classId"
              params={{classId:workspace.classId}}
              search={{view:"learn",tab:"lessons",lesson:lesson.id,session:undefined}}
              className="underline-offset-2 hover:underline">{lesson.title}</Link>}/>
        </div>
      </section>}
    </div>}>
    {record.isError&&<p role="alert" className="border border-border bg-card p-5 text-sm">
      Class progress is unavailable under your current learner permissions.
    </p>}
    {workspace.tab==="lessons"&&(!data
      ?<p role="status" className="border border-border bg-card p-5 text-sm">Loading your Course lessons…</p>
      :data.lessons.some(lesson=>lesson.lessonBody.trim().length>0 ||
          lesson.videoResources.length>0)
        ?<NativeClassLessonContentPanel classEnrollmentId={learner.classEnrollmentId}
          lessons={data.lessons} selectedLessonId={workspace.selectedLessonId}/>
        :<RecordedInstructorWorkspace
          key={learner.courseAttemptId} courseAttemptId={learner.courseAttemptId}
          initialLessonId={workspace.selectedLessonId} mode="native"/> )}
    {workspace.tab==="progress"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">My progress and outcomes</h2>
      {!data?<p className="mt-4 text-sm">Checking verified learning records…</p>:<>
        <p className="mt-3 text-sm">{completed} / {data.lessons.length} lessons completed or waived.</p>
        <ul className="mt-4 divide-y divide-border">
          {data.outcomes.map(item=><li key={item.id} className="py-3 text-sm">
            <strong>{item.kind}</strong> · {item.result}
          </li>)}
        </ul>
        <h3 className="mt-5 text-sm font-semibold">Official awards</h3>
        <p className="mt-2 text-sm">{data.awards.filter(a=>!a.revokedAt).length} active awards recorded.</p>
      </>}
    </section>}
    {workspace.tab==="discussions"&&
      <NativeClassDiscussionPanel classEnrollmentId={learner.classEnrollmentId}/>}
    {workspace.tab==="assignments"&&<div className="space-y-5">
      <NativeClassHomeworkPanel classEnrollmentId={learner.classEnrollmentId}/>
      <NativeClassCanonicalEvidencePanel classEnrollmentId={learner.classEnrollmentId}/>
    </div>}
    {workspace.tab==="assessments"&&<div className="space-y-5">
      <NativeClassKnowledgeCheckPanel courseAttemptId={learner.courseAttemptId}/>
    </div>}
    {workspace.tab==="sessions"&&<>
      <NativeClassSessionsPanel workspace={workspace}/>
      {learner.status==="active"&&<NativeClassroomCompanion courseAttemptId={learner.courseAttemptId}/>}
    </>}
  </UnifiedCoursePlayer>;
}
function TeachingClass({workspace}:{workspace:Workspace}){
  const client=useQueryClient();
  const canSeeNames=workspace.canViewRoster;
  return <UnifiedCoursePlayer context="native" title={workspace.title}
    subtitle="Class delivery and instructional preparation. This view never exposes a learner's personal Course Attempt or official awarding authority."
    actions={<Link to="/class" search={{}} className="text-sm font-semibold underline">All Classes</Link>}
    metadata={<>
      <span><strong>Assignment:</strong> {workspace.staffRole??"Facilitator"}</span>
      <span><strong>Current roster:</strong> {workspace.rosterCount}</span>
      <span><strong>Delivery:</strong> {workspace.deliveryMode.replaceAll("_"," ")}</span>
    </>}
    rail={<div className="space-y-4">
      <ClassNavigation workspace={workspace}/>
      <section className="border border-border bg-card p-4">
        <h2 className="text-sm font-semibold">Course sequence</h2>
        <div className="mt-3 max-h-96 overflow-y-auto">
          <UnifiedLessonOutline selectedId={workspace.selectedLessonId}
            lessons={workspace.lessons.map(item=>({
              id:item.id,title:item.title,group:item.unitTitle,
            }))}
            renderAction={item=><Link to="/class/$classId"
              params={{classId:workspace.classId}}
              search={{view:"teach",tab:"lessons",lesson:item.id,session:undefined}}
              className="underline-offset-2 hover:underline">{item.title}</Link>}/>
        </div>
      </section>
    </div>}>
    {workspace.tab==="discussions"&&
      <NativeClassDiscussionPanel classId={workspace.classId}/>}
    {workspace.tab==="assignments"&&(
      workspace.staffRole==="teacher"
        ?<NativeClassTeacherHomeworkPanel classId={workspace.classId}/>
        :<section className="border border-border bg-card p-5 text-sm">
          Class homework responses require a verified assigned academic teacher.
        </section>
    )}
    {workspace.tab==="assessments"&&(
      workspace.staffRole==="teacher"
        ?<NativeClassTeacherAssessmentPanel classId={workspace.classId}/>
        :<section className="border border-border bg-card p-5 text-sm">
          Knowledge-check authoring and review require an authorized academic teaching role.
        </section>
    )}
    {workspace.tab==="overview"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Teaching overview</h2>
      <p className="mt-3 text-sm">{workspace.lessons.length} published lessons · {workspace.rosterCount} current enrollments.</p>
      <p className="mt-3 text-sm text-muted-foreground">
        Recorded teachers and approved Course content are centrally governed.
        Local classroom delivery does not fork the Course or overwrite learner progress.
      </p>
    </section>}
    {workspace.tab==="lessons"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Prepare lessons</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Select a published lesson in the outline. Content preview and shared-screen playback require an independently authorized facilitator Session.
      </p>
      {workspace.selectedLessonId&&<p className="mt-4 text-sm">
        Selected: {workspace.lessons.find(x=>x.id===workspace.selectedLessonId)?.title??"Unavailable lesson"}.
      </p>}
    </section>}
    {workspace.tab==="sessions"&&<NativeClassSessionsPanel workspace={workspace}
      canSchedule={workspace.canControlRoom}
      onChanged={()=>client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]})}/>}
    {workspace.tab==="classroom"&&(
      workspace.canControlRoom
      ?<NativeClassSessionsPanel workspace={workspace} canSchedule showConsole
        onChanged={()=>client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]})}/>
      :<section className="border border-border bg-card p-5 text-sm">
        Facilitated classroom controls require a separately verified Site room-facilitator
        grant, a current Class assignment and an authorized scheduled Session.
      </section>
    )}
    {workspace.tab==="roster"&&<Roster workspace={workspace} namesAllowed={canSeeNames}/>}
  </UnifiedCoursePlayer>;
}
function Roster({workspace,namesAllowed}:{workspace:Workspace;namesAllowed:boolean}){
  const client=useQueryClient();
  const [grantBusy,setGrantBusy]=useState<string|null>(null);
  const [grantMessage,setGrantMessage]=useState("");
  const [grantError,setGrantError]=useState("");
  const [lifecycleNotice,setLifecycleNotice]=useState("");
  const isOperator=workspace.view==="manage"&&namesAllowed;
  async function grantKnowledgeCheck(classEnrollmentId:string){
    if(grantBusy)return;
    setGrantBusy(classEnrollmentId);setGrantError("");setGrantMessage("");
    try{
      const issued=await provisionNativeClassKnowledgeCheckAccess({data:{classEnrollmentId}});
      setGrantMessage(issued.alreadyGranted?
        "Canonical assessment access already exists for this learner.":
        "Canonical assessment access granted under the published Course administration.");
      await client.invalidateQueries({queryKey:["native-class-roster",workspace.classId]});
    }catch(error){
      setGrantError(normalizeClientError(error,
        "No approved Course assessment administration is available, or your provider grant is insufficient.").message);
    }finally{setGrantBusy(null);}
  }
  const pages=useInfiniteQuery({
    queryKey:["native-class-roster",workspace.classId],
    initialPageParam:0,
    queryFn:({pageParam})=>getNativeClassRosterPage({
      data:{classId:workspace.classId,offset:pageParam},
    }),
    getNextPageParam:last=>last.nextOffset,
    enabled:isOperator,retry:false,
  });
  const rows=isOperator?pages.data?.pages.flatMap(page=>page.members)??[]:workspace.roster;
  const total=isOperator?pages.data?.pages[0]?.total??workspace.rosterCount:workspace.rosterCount;
  return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Class roster</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      {total} active or pending enrollments.
      {!namesAllowed&&" Your instructional assignment permits roster counts. Learner identities require separately approved authorization."}
    </p>
    {isOperator&&pages.isPending&&<p role="status" className="mt-3 text-sm">Loading your authorized Class roster…</p>}
    {isOperator&&pages.isError&&<p role="alert" className="mt-3 text-sm">
      Roster access is unavailable. Check your current Site authorization.
    </p>}
    {namesAllowed&&(!isOperator||pages.isSuccess)&&<RosterList rows={rows} rowKey={row=>row.enrollmentId}
      primary={row=>row.name}
      detail={row=>`${row.status} · ${row.creditMode.replaceAll("_"," ")}`}
      actions={row=><>
        {isOperator&&"courseAttemptId" in row&&typeof row.courseAttemptId==="string"&&row.status==="active"&&
          <Button type="button" size="sm" variant="outline" disabled={!!grantBusy}
            onClick={()=>void grantKnowledgeCheck(row.enrollmentId)}>
            {grantBusy===row.enrollmentId?"Granting…":"Grant Course knowledge check"}
          </Button>}
        {isOperator&&(row.status==="active"||row.status==="pending")&&
          <NativeClassRosterLifecycleAction
            classEnrollmentId={row.enrollmentId} status={row.status}
            onCompleted={setLifecycleNotice}
            onChanged={async()=>{
              await Promise.all([
                client.invalidateQueries({queryKey:["native-class-roster",workspace.classId]}),
                client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]}),
              ]);
            }}/>}
      </>}
      emptyMessage="No active or pending learners in this Class."/>}
    {lifecycleNotice&&<p role="status" className="mt-3 text-sm">{lifecycleNotice}</p>}
    {grantMessage&&<p role="status" className="mt-3 text-sm">{grantMessage}</p>}
    {grantError&&<p role="alert" className="mt-3 text-sm text-destructive">{grantError}</p>}
    {isOperator&&pages.hasNextPage&&<Button className="mt-4" variant="outline"
      disabled={pages.isFetchingNextPage} onClick={()=>void pages.fetchNextPage()}>
      {pages.isFetchingNextPage?"Loading…":"Load more learners"}
    </Button>}
    {isOperator&&pages.isSuccess&&<p className="mt-3 text-xs text-muted-foreground">
      Showing {rows.length} of {total} learners. Identity access is reverified on every page.
    </p>}
    {!isOperator&&workspace.rosterTruncated&&<p className="mt-4 text-sm text-muted-foreground">
      Displaying the first 100 records. Ask your authorized Class manager for the complete roster.
    </p>}
  </section>;
}
function ManagingClass({workspace}:{workspace:Workspace}){
  const client=useQueryClient();
  const approvals=useQuery({
    queryKey:["native-class-approval-queue",workspace.classId],
    queryFn:()=>getNativeClassApprovalQueue({data:{classId:workspace.classId}}),
    enabled:workspace.tab==="roster",retry:false,
  });
  const repeats=useQuery({
    queryKey:["native-class-repeat-candidates",workspace.classId],
    queryFn:()=>listNativeClassRepeatCandidates({data:{classId:workspace.classId}}),
    enabled:workspace.tab==="roster",retry:false,
  });
  const [repeatReason,setRepeatReason]=useState("");
  const [reviewReason,setReviewReason]=useState("");
  const [learnerPersonId,setLearnerPersonId]=useState("");
  const [learnerCreditMode,setLearnerCreditMode]=useState<"audit"|"not_applicable">("not_applicable");
  const [staffPersonId,setStaffPersonId]=useState("");
  const [staffRole,setStaffRole]=useState<"teacher"|"facilitator">("facilitator");
  const [canVerifyAttendance,setCanVerifyAttendance]=useState(false);
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function refresh(){await client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]});}
  async function assignLearner(){
    if(!learnerPersonId||pending)return;
    setPending(true);setError("");setNotice("");
    try{
      const result=await assignAdultToNativeClass({data:{
        classId:workspace.classId,learnerPersonId,creditMode:learnerCreditMode,
      }});
      await refresh();
      setLearnerPersonId("");
      setNotice(result.alreadyEnrolled?
        "Learner already belongs to this Class.":
        "Verified adult learner assigned to the Class without a Class Offering.");
    }catch(e){setError(normalizeClientError(e,"Could not assign Class learner.").message)}
    finally{setPending(false)}
  }
  async function approveRepeat(candidate:{
    priorEnrollmentId:string;completionOutcomeId:string;evidenceVersionId:string|null;
  }){
    if(pending||!candidate.evidenceVersionId||repeatReason.trim().length<10)return;
    setPending(true);setError("");setNotice("");
    try{
      const result=await authorizeNativeClassRepeat({data:{
        priorEnrollmentId:candidate.priorEnrollmentId,
        completionOutcomeId:candidate.completionOutcomeId,
        evidenceVersionId:candidate.evidenceVersionId,
        reason:repeatReason.trim(),
      }});
      setNotice(result.duplicate?
        "An unused repeat authorization already exists.":
        "A 30-day repeat authorization was recorded. A new enrollment and Course Attempt require fresh admission.");
      setRepeatReason("");
      await client.invalidateQueries({queryKey:["native-class-repeat-candidates",workspace.classId]});
    }catch(e){setError(normalizeClientError(e,"Could not authorize Class repeat.").message)}
    finally{setPending(false)}
  }
  async function decideApproval(approvalRequestId:string,decision:"approved"|"rejected"){
    if(pending)return;
    setPending(true);setError("");setNotice("");
    try{
      await decideNativeClassApproval({data:{approvalRequestId,decision,reason:reviewReason.trim()}});
      setReviewReason("");
      await client.invalidateQueries({queryKey:["native-class-approval-queue",workspace.classId]});
      setNotice(decision==="approved"?
        "Approved. Learner must independently accept current terms and claim an available seat.":
        "Request rejected with an auditable decision.");
    }catch(e){setError(normalizeClientError(e,"Could not decide Class approval.").message)}
    finally{setPending(false)}
  }
  async function inviteLearner(){
    if(!learnerPersonId||pending||!workspace.offering||
       !workspace.offering.enrollmentMethods.includes("invitation"))return;
    setPending(true);setError("");setNotice("");
    try{
      const result=await issueNativeClassInvitation({data:{
        classOfferingVersionId:workspace.offering.id,
        learnerPersonId,creditMode:learnerCreditMode,requestId:crypto.randomUUID(),
      }});
      await refresh();setLearnerPersonId("");
      setNotice(result.duplicate?"This invitation was already issued.":
        "Invitation created for the verified learner. They must sign in, accept consent, and claim an available seat within 48 hours. No seat is reserved.");
    }catch(e){setError(normalizeClientError(e,"Could not invite Class learner.").message)}
    finally{setPending(false)}
  }
  async function assign(){
    if(!staffPersonId||pending)return;
    setPending(true);setError("");setNotice("");
    try{
      await assignNativeClassStaff({data:{classId:workspace.classId,personId:staffPersonId,roleCode:staffRole,canVerifyAttendance}});
      await refresh();setNotice("Verified Class staff assignment saved.");
    }catch(e){setError(normalizeClientError(e,"Could not assign staff.").message)}
    finally{setPending(false)}
  }
  async function end(assignmentId:string){
    if(pending)return;setPending(true);setError("");setNotice("");
    try{
      await endNativeClassStaffAssignment({data:{classId:workspace.classId,assignmentId}});
      await refresh();setNotice("Class assignment ended; historical evidence remains.");
    }catch(e){setError(normalizeClientError(e,"Could not end the assignment.").message)}
    finally{setPending(false)}
  }
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Class management" title={workspace.title}
    subtitle="Manage the authorized Class and its enrollment contract. Marketing visibility does not change instructional governance."
    actions={<Link to="/class" search={{}} className="text-sm font-semibold underline">All Classes</Link>}>
    <div className="mt-5"><ClassNavigation workspace={workspace}/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.65fr)]">
      <section className="border border-border bg-card p-5">
        {workspace.tab==="overview"&&<>
          <h2 className="font-serif text-2xl">Class overview</h2>
          <p className="mt-3 text-sm">{workspace.rosterCount} current enrollments · {workspace.deliveryMode.replaceAll("_"," ")} · {workspace.state}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            One Course version, one Class identity, one enrollment model. Official grades and awards remain individual, authorized outcomes.
          </p>
          <div className="mt-5"><NativeClassActivationStatus classId={workspace.classId}/></div>
        </>}
        {workspace.tab==="offering"&&<>
          <h2 className="font-serif text-2xl">Class Offering</h2>
          {workspace.offering?<div className="mt-4 space-y-2 text-sm">
            <p><strong>Status:</strong> {workspace.offering.state} · version {workspace.offering.versionNo}</p>
            <p><strong>Visibility:</strong> {workspace.offering.visibility}</p>
            <p><strong>Enrollment:</strong> {workspace.offering.enrollmentMethods.join(", ")}</p>
            <p><strong>Credit participation:</strong> {workspace.offering.allowedCreditModes.join(", ")}</p>
            <p><strong>Capacity:</strong> {workspace.offering.capacity??"Unlimited"}</p>
          </div>:<p className="mt-3 text-sm">Class Offering terms are unavailable.</p>}
          <p className="mt-4 text-sm text-muted-foreground">
            Publish, close and revise terms through the authorized Class administration workflow.
          </p>
          <Link to="/class" search={{view:"manage"}} className="mt-3 inline-block text-sm font-semibold underline">
            Class Offering controls
          </Link>
        </>}
        {workspace.tab==="roster"&&<>
          <Roster workspace={workspace} namesAllowed={true}/>
          <section className="mt-5 border border-border p-4" aria-label="Class approval requests">
            <h3 className="font-semibold">Approval requests</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Only authorized Site staff can review verified adult applicants.
              Approval neither enrolls nor reserves a seat.
            </p>
            {approvals.isError&&<p role="alert" className="mt-2 text-sm">Approval queue unavailable.</p>}
            {approvals.data?.length===0&&<p className="mt-2 text-sm">No pending requests.</p>}
            <Label className="mt-3 block text-sm font-semibold" htmlFor="class-approval-reason">
              Decision rationale
            </Label>
            <Textarea id="class-approval-reason" value={reviewReason}
              maxLength={1000} onChange={event=>setReviewReason(event.target.value)}
              placeholder="Record the independent eligibility review and reason for approving or rejecting"
              className="mt-2"/>
            <ul className="mt-3 space-y-2">
              {approvals.data?.map(item=><li key={item.approvalRequestId}
                className="border border-border p-3 text-sm">
                <p>Applicant: {item.learnerPersonId}</p>
                <p>Requested: {new Date(item.requestedAt).toLocaleString()}</p>
                <p>Expires: {new Date(item.expiresAt).toLocaleString()}</p>
                <div className="mt-3 flex gap-2">
                  <Button disabled={pending||reviewReason.trim().length<3}
                    onClick={()=>void decideApproval(item.approvalRequestId,"approved")}>Approve</Button>
                  <Button variant="outline" disabled={pending||reviewReason.trim().length<3}
                    onClick={()=>void decideApproval(item.approvalRequestId,"rejected")}>Reject</Button>
                </div>
              </li>)}
            </ul>
          </section>
          <section className="mt-5 border border-border p-4" aria-label="Completed Class repeat authorization">
            <h3 className="font-semibold">Authorize completed learner repeats</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              A completed Class is historical evidence. Only an independent Site reviewer
              may grant a one-time repeat from the verified completion outcome.
              Authorization never reserves a seat or reopens the old attempt.
            </p>
            {repeats.isError&&<p role="alert" className="mt-2 text-sm">Repeat evidence is unavailable.</p>}
            {repeats.data?.length===0&&<p className="mt-2 text-sm">No independently reviewable completed learners.</p>}
            <Label className="mt-3 block text-sm font-semibold" htmlFor="class-repeat-reason">
              Independent review rationale
            </Label>
            <Textarea id="class-repeat-reason" maxLength={1000} value={repeatReason}
              onChange={e=>setRepeatReason(e.target.value)}
              placeholder="Document the independent reason for allowing the learner to repeat this completed Class"
              className="mt-2"/>
            <ul className="mt-3 space-y-2">
              {repeats.data?.map(item=><li key={item.completionOutcomeId}
                className="border border-border p-3 text-sm">
                <p>Completed learner: {item.learnerPersonId}</p>
                <p>Completion evidence: {item.completionOutcomeId}</p>
                <Button className="mt-3" variant="outline"
                  disabled={pending||repeatReason.trim().length<10||!item.evidenceVersionId}
                  onClick={()=>void approveRepeat(item)}>Authorize one-time repeat</Button>
              </li>)}
            </ul>
          </section>
          <NativeClassAssessmentReviewPanel classId={workspace.classId}/>
          <NativeClassSurveyCampaignPanel classId={workspace.classId}/>
          <div className="mt-6 border-t border-border pt-5">
            <h3 className="text-base font-semibold">Assign an existing adult learner</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Assignment is independent of Class Offering publication. Candidates
              must already have a verified organization-scoped learner grant.
              The Class's Site authority is checked independently. Minors
              require the separate school/guardian placement flow.
            </p>
            <Label htmlFor="class-assign-learner" className="mt-4 block text-sm font-semibold">
              Verified learner
            </Label>
            <Select id="class-assign-learner" value={learnerPersonId}
              onChange={event=>setLearnerPersonId(event.target.value)}
              className="mt-2 min-h-11">
              <option value="">Choose an authorized learner</option>
              {workspace.learnerCandidates.map(person=><option
                key={person.personId} value={person.personId}>{person.name}</option>)}
            </Select>
            <Label htmlFor="class-assign-credit" className="mt-4 block text-sm font-semibold">
              Individual participation
            </Label>
            <Select id="class-assign-credit" value={learnerCreditMode}
              onChange={event=>setLearnerCreditMode(event.target.value as typeof learnerCreditMode)}
              className="mt-2 min-h-11">
              <option value="not_applicable">No academic credit</option>
              <option value="audit">Audit</option>
            </Select>
            <Button className="mt-4" disabled={!learnerPersonId||pending}
              onClick={()=>void assignLearner()}>Assign to Class</Button>
            {workspace.offering?.state==="published"&&
              workspace.offering.enrollmentMethods.includes("invitation")&&
              <Button className="mt-4 ml-2" variant="outline"
                disabled={!learnerPersonId||pending}
                onClick={()=>void inviteLearner()}>Invite to Class</Button>}
            {workspace.offering?.state==="published"&&
              workspace.offering.enrollmentMethods.includes("invitation")&&
              <p className="mt-2 text-xs text-muted-foreground">
                An invitation is not an enrollment or a seat reservation. The recipient accepts current published terms from their own Class account.
              </p>}
          </div>
        </>}
        {workspace.tab==="sessions"&&<NativeClassSessionsPanel workspace={workspace}
          canRevoke onChanged={refresh}/>}
        {workspace.tab==="completion"&&<>
          <h2 className="font-serif text-2xl">Completion governance</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Review the original Class completion policy and verified evidence.
            An independent, currently authorized reviewer must approve source
            evidence before a provider can record a formal outcome.
            This does not grant academic credit or create an award.
          </p>
          <Suspense fallback={<p role="status" className="mt-4 text-sm">Loading completion review…</p>}>
            <NativeClassCompletionOperatorPanel classId={workspace.classId}/>
          </Suspense>
        </>}
        {workspace.tab==="reports"&&<>
          <h2 className="font-serif text-2xl">Reporting</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Inspect source-backed registrations, scheduled and delivered Sessions, facilitator-attested presence, assessments and recorded outcomes.
            Formal Class completion remains unavailable until independently governed decisions are verified.
          </p>
          <Suspense fallback={<p role="status" className="mt-4 text-sm">Loading Class evidence…</p>}>
            <NativeClassReportPanel classId={workspace.classId}/>
          </Suspense>
        </>}
      </section>
      <aside className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Class teaching team</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A verified Site role alone cannot open this Class as a teacher. Each teacher or facilitator also requires an explicit Class assignment.
        </p>
        {workspace.siteId?<div className="mt-4 space-y-3">
          <Label htmlFor="class-staff-person" className="block text-sm font-semibold">Verified Site staff</Label>
          <Select id="class-staff-person" value={staffPersonId} onChange={e=>setStaffPersonId(e.target.value)}
            className="min-h-11">
            <option value="">Select an authorized person</option>
            {workspace.staffCandidates.map(person=><option key={person.personId} value={person.personId}>
              {person.name}
            </option>)}
          </Select>
          <Label htmlFor="class-staff-role" className="block text-sm font-semibold">Class responsibility</Label>
          <Select id="class-staff-role" value={staffRole} onChange={e=>setStaffRole(e.target.value as typeof staffRole)}
            className="min-h-11">
            <option value="facilitator">Facilitator</option>
            <option value="teacher">Class teacher</option>
          </Select>
          <Label className="flex items-start gap-3 border border-border p-3 text-sm">
            <Checkbox checked={canVerifyAttendance}
              onChange={event=>setCanVerifyAttendance(event.target.checked)}
              className="mt-1"/>
            <span><strong>Authorize attendance verification</strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                Separately grant this facilitator access to the exact Class's
                roster, roll call and recorded corrections. This is not academic grading authority.
              </span>
            </span>
          </Label>
          <Button disabled={pending||!staffPersonId} onClick={()=>void assign()}>Assign to Class</Button>
        </div>:<p className="mt-4 text-sm">Provider-wide self-paced Classes do not need local teaching staff.</p>}
        <ul className="mt-5 divide-y divide-border">
          {workspace.staffAssignments.map(assignment=><li key={assignment.id} className="py-3">
            <p className="text-sm font-semibold">{assignment.name}</p>
            <p className="text-xs text-muted-foreground">{assignment.roleCode}
              {assignment.attendanceAuthorized?" · Attendance authorized":" · Attendance not authorized"}
            </p>
            <Button variant="outline" size="sm" className="mt-2" disabled={pending}
              onClick={()=>void end(assignment.id)}>End assignment</Button>
          </li>)}
        </ul>
        {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
        {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
      </aside>
    </div>
  </WorkspaceShell>;
}
