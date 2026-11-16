import { createFileRoute, Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { UnifiedLessonOutline } from "@/components/learning/UnifiedLessonOutline";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { CourseLessonProgress } from "@/components/learning/CourseLessonProgress";
import { NativeClassSessionsPanel } from "@/components/learning/NativeClassSessionsPanel";
import { NativeClassroomCompanion } from "@/components/learning/NativeClassroomCompanion";
import { NativeClassCanonicalEvidencePanel } from "@/components/learning/NativeClassCanonicalEvidencePanel";
import { NativeClassAssessmentReviewPanel } from "@/components/learning/NativeClassAssessmentReviewPanel";
import { NativeClassRosterLifecycleAction } from "@/components/learning/NativeClassRosterLifecycleAction";
import { NativeClassSurveyCampaignPanel } from "@/components/learning/NativeClassSurveyCampaignPanel";
import { getNativeClassWorkspace, getNativeClassRosterPage } from "@/modules/classes/native-class-workspace.functions";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";
import { assignAdultToNativeClass } from "@/modules/classes/native-class-assignment.functions";
import { provisionNativeClassKnowledgeCheckAccess } from "@/modules/classes/native-class-assessment-provision.functions";
import {
  assignNativeClassStaff, endNativeClassStaffAssignment,
} from "@/modules/classes/class-staff.functions";
import { classViews, classTabs, type ClassView } from "@/domain/class-views";
import { normalizeClientError } from "@/lib/client-error";

const uuid=z.string().uuid();
const searchSchema=z.object({
  view:z.enum(classViews).optional(),
  tab:z.string().max(40).optional(),
  lesson:uuid.optional(),
  session:uuid.optional(),
}).strip();

export const Route=createFileRoute("/classes_/$classId")({
  validateSearch:(raw:Record<string,unknown>)=>searchSchema.parse(raw),
  component:OneClassWorkspace,
});
type Workspace=Awaited<ReturnType<typeof getNativeClassWorkspace>>;

const tabLabels:Record<string,string>={
  overview:"Overview",lessons:"Lessons",assignments:"Assignments",
  progress:"My progress",sessions:"Sessions",roster:"Roster",
  classroom:"Classroom",offering:"Class Offering",reports:"Reports",
};
const viewLabels:Record<ClassView,string>={
  learn:"Student",teach:"Teacher / Facilitator",manage:"Administration",
};

function ClassNavigation({workspace}:{workspace:Workspace}){
  return <nav aria-label="Class navigation" className="border-b border-border bg-card">
    <div className="flex flex-wrap gap-1 border-b border-border p-2">
      {workspace.availableViews.map(view=><Link key={view} to="/classes/$classId"
        params={{classId:workspace.classId}}
        search={{view,tab:undefined,lesson:undefined,session:undefined}}
        aria-current={view===workspace.view?"page":undefined}
        className={"px-3 py-2 text-sm font-semibold "+
          (view===workspace.view?"bg-primary text-primary-foreground":"hover:bg-muted")}>
        {viewLabels[view]}
      </Link>)}
    </div>
    <div className="flex flex-wrap gap-1 p-2">
      {workspace.availableTabs.map(tab=><Link key={tab} to="/classes/$classId"
        params={{classId:workspace.classId}}
        search={{view:workspace.view,tab,lesson:undefined,session:undefined}}
        aria-current={workspace.tab===tab?"page":undefined}
        className={"px-3 py-2 text-sm "+
          (workspace.tab===tab?"border-b-2 border-primary font-semibold":"text-muted-foreground hover:text-foreground")}>
        {tabLabels[tab]??tab}
      </Link>)}
    </div>
  </nav>;
}
function OneClassWorkspace(){
  const {classId}=Route.useParams();
  const search=Route.useSearch();
  const workspace=useQuery({
    queryKey:["native-unified-class",classId,search.view,search.tab,search.lesson,search.session],
    queryFn:()=>getNativeClassWorkspace({data:{classId,...search}}),retry:false,
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
    <Link to="/classes" search={{}} className="mt-4 inline-block text-sm font-semibold underline">
      Return to Classes
    </Link>
  </WorkspaceShell>;
  const data=workspace.data;
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
    actions={<Link to="/classes" search={{}} className="text-sm font-semibold underline">All Classes</Link>}
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
            renderAction={lesson=><Link to="/classes/$classId"
              params={{classId:workspace.classId}}
              search={{view:"learn",tab:"lessons",lesson:lesson.id,session:undefined}}
              className="underline-offset-2 hover:underline">{lesson.title}</Link>}/>
        </div>
      </section>}
    </div>}>
    {record.isError&&<p role="alert" className="border border-border bg-card p-5 text-sm">
      Class progress is unavailable under your current learner permissions.
    </p>}
    {workspace.tab==="lessons"&&<RecordedInstructorWorkspace
      key={learner.courseAttemptId} courseAttemptId={learner.courseAttemptId}
      initialLessonId={workspace.selectedLessonId} mode="native"/>}
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
    {workspace.tab==="assignments"&&
      <NativeClassCanonicalEvidencePanel classEnrollmentId={learner.classEnrollmentId}/>}
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
    actions={<Link to="/classes" search={{}} className="text-sm font-semibold underline">All Classes</Link>}
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
            renderAction={item=><Link to="/classes/$classId"
              params={{classId:workspace.classId}}
              search={{view:"teach",tab:"lessons",lesson:item.id,session:undefined}}
              className="underline-offset-2 hover:underline">{item.title}</Link>}/>
        </div>
      </section>
    </div>}>
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
      canSchedule onChanged={()=>client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]})}/>}
    {workspace.tab==="classroom"&&<NativeClassSessionsPanel workspace={workspace}
      canSchedule showConsole
      onChanged={()=>client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]})}/>}
    {workspace.tab==="roster"&&<Roster workspace={workspace} namesAllowed={canSeeNames}/>}
  </UnifiedCoursePlayer>;
}
function Roster({workspace,namesAllowed}:{workspace:Workspace;namesAllowed:boolean}){
  const client=useQueryClient();
  const [grantBusy,setGrantBusy]=useState<string|null>(null);
  const [grantMessage,setGrantMessage]=useState("");
  const [grantError,setGrantError]=useState("");
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
    {namesAllowed&&<ul className="mt-4 divide-y divide-border">
      {rows.map(row=><li key={row.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <span className="font-semibold">{row.name}</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{row.status} · {row.creditMode.replaceAll("_"," ")}</span>
          {isOperator&&"courseAttemptId" in row&&row.courseAttemptId&&row.status==="active"&&
            <Button type="button" size="sm" variant="outline" disabled={!!grantBusy}
              onClick={()=>void grantKnowledgeCheck(row.enrollmentId)}>
              {grantBusy===row.enrollmentId?"Granting…":"Grant Course knowledge check"}
            </Button>}
          {isOperator&&(row.status==="active"||row.status==="pending")&&
            <NativeClassRosterLifecycleAction
              classEnrollmentId={row.enrollmentId} status={row.status}
              onChanged={async()=>{
                await Promise.all([
                  client.invalidateQueries({queryKey:["native-class-roster",workspace.classId]}),
                  client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]}),
                ]);
              }}/>}

        </div>
      </li>)}
    </ul>}
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
    actions={<Link to="/classes" search={{}} className="text-sm font-semibold underline">All Classes</Link>}>
    <div className="mt-5"><ClassNavigation workspace={workspace}/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,.65fr)]">
      <section className="border border-border bg-card p-5">
        {workspace.tab==="overview"&&<>
          <h2 className="font-serif text-2xl">Class overview</h2>
          <p className="mt-3 text-sm">{workspace.rosterCount} current enrollments · {workspace.deliveryMode.replaceAll("_"," ")} · {workspace.state}</p>
          <p className="mt-3 text-sm text-muted-foreground">
            One Course version, one Class identity, one enrollment model. Official grades and awards remain individual, authorized outcomes.
          </p>
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
          <Link to="/canonical/classes" className="mt-3 inline-block text-sm font-semibold underline">
            Class Offering controls
          </Link>
        </>}
        {workspace.tab==="roster"&&<>
          <Roster workspace={workspace} namesAllowed={true}/>
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
            <label htmlFor="class-assign-learner" className="mt-4 block text-sm font-semibold">
              Verified learner
            </label>
            <select id="class-assign-learner" value={learnerPersonId}
              onChange={event=>setLearnerPersonId(event.target.value)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="">Choose an authorized learner</option>
              {workspace.learnerCandidates.map(person=><option
                key={person.personId} value={person.personId}>{person.name}</option>)}
            </select>
            <label htmlFor="class-assign-credit" className="mt-4 block text-sm font-semibold">
              Individual participation
            </label>
            <select id="class-assign-credit" value={learnerCreditMode}
              onChange={event=>setLearnerCreditMode(event.target.value as typeof learnerCreditMode)}
              className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
              <option value="not_applicable">No academic credit</option>
              <option value="audit">Audit</option>
            </select>
            <Button className="mt-4" disabled={!learnerPersonId||pending}
              onClick={()=>void assignLearner()}>Assign to Class</Button>
          </div>
        </>}
        {workspace.tab==="sessions"&&<NativeClassSessionsPanel workspace={workspace}
          canRevoke onChanged={refresh}/>}
        {workspace.tab==="reports"&&<>
          <h2 className="font-serif text-2xl">Reporting</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Authoritative Class outcomes, attendance and awards will contribute to authorized reporting after native assessment and Session evidence are connected.
          </p>
        </>}
      </section>
      <aside className="border border-border bg-card p-5">
        <h2 className="font-serif text-xl">Class teaching team</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A verified Site role alone cannot open this Class as a teacher. Each teacher or facilitator also requires an explicit Class assignment.
        </p>
        {workspace.siteId?<div className="mt-4 space-y-3">
          <label htmlFor="class-staff-person" className="block text-sm font-semibold">Verified Site staff</label>
          <select id="class-staff-person" value={staffPersonId} onChange={e=>setStaffPersonId(e.target.value)}
            className="min-h-11 w-full border border-border bg-background px-3 text-sm">
            <option value="">Select an authorized person</option>
            {workspace.staffCandidates.map(person=><option key={person.personId} value={person.personId}>
              {person.name}
            </option>)}
          </select>
          <label htmlFor="class-staff-role" className="block text-sm font-semibold">Class responsibility</label>
          <select id="class-staff-role" value={staffRole} onChange={e=>setStaffRole(e.target.value as typeof staffRole)}
            className="min-h-11 w-full border border-border bg-background px-3 text-sm">
            <option value="facilitator">Facilitator</option>
            <option value="teacher">Class teacher</option>
          </select>
          <label className="flex items-start gap-3 border border-border p-3 text-sm">
            <input type="checkbox" checked={canVerifyAttendance}
              onChange={event=>setCanVerifyAttendance(event.target.checked)}
              className="mt-1"/>
            <span><strong>Authorize attendance verification</strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                Separately grant this facilitator access to the exact Class's
                roster, roll call and recorded corrections. This is not academic grading authority.
              </span>
            </span>
          </label>
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
