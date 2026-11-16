import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { WorkspaceShell } from "@/components/workspace";
import { UnifiedCoursePlayer } from "@/components/learning/UnifiedCoursePlayer";
import { UnifiedLessonOutline } from "@/components/learning/UnifiedLessonOutline";
import { RecordedInstructorWorkspace } from "@/components/learning/RecordedInstructorWorkspace";
import { CourseLessonProgress } from "@/components/learning/CourseLessonProgress";
import { getNativeClassWorkspace } from "@/modules/classes/native-class-workspace.functions";
import { getNativeClassLearning } from "@/modules/classes/native-class-learning.functions";
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
    {workspace.tab==="assignments"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Assignments</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Canonical graded assessments are not yet connected to this native Class workspace.
        Recorded teacher practice is accessible through Lessons and does not change official assessment requirements.
      </p>
    </section>}
    {workspace.tab==="sessions"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Class sessions</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        Session scheduling and instructor-controlled classroom pairing will appear after Class-to-Session authorization is enabled.
      </p>
    </section>}
  </UnifiedCoursePlayer>;
}
function TeachingClass({workspace}:{workspace:Workspace}){
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
    {workspace.tab==="classroom"&&<section className="border border-border bg-card p-5">
      <h2 className="font-serif text-2xl">Classroom presentation</h2>
      <p className="mt-3 text-sm text-muted-foreground">
        The shared classroom player and projector use the same validated media renderer.
        Live room controls remain disabled until a Session is explicitly attached to this Class and your facilitator authorization is verified.
      </p>
    </section>}
    {workspace.tab==="roster"&&<Roster workspace={workspace} namesAllowed={canSeeNames}/>}
  </UnifiedCoursePlayer>;
}
function Roster({workspace,namesAllowed}:{workspace:Workspace;namesAllowed:boolean}){
  return <section className="border border-border bg-card p-5">
    <h2 className="font-serif text-2xl">Class roster</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      {workspace.rosterCount} active or pending enrollments.
      {!namesAllowed&&" Your instructional assignment permits roster counts. Learner identities require a separately approved roster-read permission."}
    </p>
    {namesAllowed&&<ul className="mt-4 divide-y divide-border">
      {workspace.roster.map(row=><li key={row.enrollmentId} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
        <span className="font-semibold">{row.name}</span>
        <span className="text-muted-foreground">{row.status} · {row.creditMode.replaceAll("_"," ")}</span>
      </li>)}
    </ul>}
    {workspace.rosterTruncated&&<p className="mt-4 text-sm text-muted-foreground">
      Displaying the first 100 records. Pagination is required before this roster can be used for complete reporting.
    </p>}
  </section>;
}
function ManagingClass({workspace}:{workspace:Workspace}){
  const client=useQueryClient();
  const [staffPersonId,setStaffPersonId]=useState("");
  const [staffRole,setStaffRole]=useState<"teacher"|"facilitator">("facilitator");
  const [pending,setPending]=useState(false);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  async function refresh(){await client.invalidateQueries({queryKey:["native-unified-class",workspace.classId]});}
  async function assign(){
    if(!staffPersonId||pending)return;
    setPending(true);setError("");setNotice("");
    try{
      await assignNativeClassStaff({data:{classId:workspace.classId,personId:staffPersonId,roleCode:staffRole}});
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
        {workspace.tab==="roster"&&<Roster workspace={workspace} namesAllowed={true}/>}
        {workspace.tab==="sessions"&&<>
          <h2 className="font-serif text-2xl">Sessions</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            Native dated Sessions and room assignment are not yet connected to Class operations.
            Do not treat a room code as permission to access this Class.
          </p>
        </>}
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
          <Button disabled={pending||!staffPersonId} onClick={()=>void assign()}>Assign to Class</Button>
        </div>:<p className="mt-4 text-sm">Provider-wide self-paced Classes do not need local teaching staff.</p>}
        <ul className="mt-5 divide-y divide-border">
          {workspace.staffAssignments.map(assignment=><li key={assignment.id} className="py-3">
            <p className="text-sm font-semibold">{assignment.name}</p>
            <p className="text-xs text-muted-foreground">{assignment.roleCode}</p>
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
