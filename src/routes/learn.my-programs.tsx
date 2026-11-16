import {createFileRoute,Link,redirect} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import {BookOpen,MapPin,Users} from "lucide-react";
import {WorkspaceShell} from "@/components/workspace";
import {useWorkspaceSession,workspaceSessionQueryOptions} from "@/components/shell/WorkspaceSession";
import {getMyNoncreditSelfEnrollments} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import {getEnrichmentFamily} from "@/modules/activities/enrichment-family.functions";
import {getCourseRegistration} from "@/modules/learning/course-registration.functions";

/** Unified account landing, but not an authorization bypass. Adult, guardian
 * and student data are read through their original domain services under the
 * currently verified session grant. Switching roles never merges records. */
export const Route=createFileRoute("/learn/my-programs")({
  loader:async({context,location})=>{
    const value=await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if(!value.session?.authenticated)
      throw redirect({to:"/access",search:{returnTo:location.href}});
  },
  component:MyPrograms,
});

function MyPrograms(){
  const {session}=useWorkspaceSession();
  const role=session?.authenticated ? session.role : undefined;
  const guardian=role==="guardian";
  const student=role==="student";
  const adult=role==="account_holder"||guardian;
  const noncredit=useQuery({
    queryKey:["my-noncredit-self-enrollments"],
    queryFn:()=>getMyNoncreditSelfEnrollments(),
    enabled:adult,retry:false,staleTime:15_000,
  });
  const family=useQuery({
    queryKey:["my-enrichment-family"],
    queryFn:()=>getEnrichmentFamily(),
    enabled:guardian,retry:false,staleTime:15_000,
  });
  const school=useQuery({
    queryKey:["my-course-registration"],
    queryFn:()=>getCourseRegistration(),
    enabled:student,retry:false,staleTime:15_000,
  });
  const activeSchool=school.data?.sections.filter(s=>s.enrollmentStatus==="active")??[];
  const children=family.data?.children??[];
  return <WorkspaceShell width="wide" eyebrow="My CAN" title="My Learning & Programs"
    subtitle="One place to find the learning accessible through your current verified role. Institutional permissions remain separate."
    actions={<Link to="/explore" className="text-sm font-semibold text-primary underline underline-offset-4">Explore programs</Link>}>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Your account, your approved relationships</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        You can participate at several learning centers with one CAN account. Staff access,
        guardianship, academic records and private rosters are verified separately by each provider.
        Change your active institutional role in <Link to="/account" className="underline text-primary">My CAN</Link>.
      </p>
    </section>
    {adult&&<section className="mt-6" aria-label="Personal training registrations">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">My Classes</h2>
        <Link to="/learn/enroll" search={{}} className="text-sm underline text-primary">Explore Classes</Link>
      </div>
      {noncredit.isPending&&<p role="status" className="mt-3 text-sm">Loading your personal training records…</p>}
      {noncredit.isError&&<p role="alert" className="mt-3 border border-border p-3 text-sm">
        Personal training records are unavailable for this verified account.
        <button type="button" className="ml-2 underline" onClick={()=>void noncredit.refetch()}>Retry</button>
      </p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {noncredit.data?.map(item=><article key={item.registrationId} className="border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{item.registrationStatus} · {item.attemptStatus}</p>
          <h3 className="mt-2 font-serif text-xl">{item.trainingTitle}</h3>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin size={14} aria-hidden="true"/>
            {item.deliveryMode==="facilitated"?item.siteName??"Approved learning center":"Independent online"}
          </p>
          {item.upcomingSessions.length>0&&<p className="mt-2 text-xs text-muted-foreground">
            Next meeting: {new Date(item.upcomingSessions[0]!.startsAt).toLocaleString()}
          </p>}
          <Link to="/learn/my-courses" className="mt-4 inline-block text-sm font-semibold underline text-primary">Manage registration</Link>
        </article>)}
        {noncredit.isSuccess&&!noncredit.data?.length&&<p className="border border-border bg-card p-4 text-sm">No personal trainings yet. Browse open opportunities to get started.</p>}
      </div>
    </section>}
    {guardian&&<section className="mt-7" aria-label="Managed family programs">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">Family programs</h2>
        <Link to="/guardian/enrichment" className="text-sm underline text-primary">Manage family registration</Link>
      </div>
      {family.isPending&&<p role="status" className="mt-3 text-sm">Loading authorized family registrations…</p>}
      {family.isError&&<p role="alert" className="mt-3 border border-border p-3 text-sm">Family records are unavailable to the current verified guardian.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {family.data?.registrations.map(item=>{
          const child=children.find(x=>x.studentProfileId===item.studentProfileId);
          return <article key={item.id} className="border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{item.status} · {item.startsOn} to {item.endsOn}</p>
            <h3 className="mt-2 font-serif text-xl">{item.offeringName}</h3>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Users size={14} aria-hidden="true"/>{child?[child.name,child.lastName].join(" "):"Authorized family member"}
            </p>
            <Link to="/guardian/enrichment" className="mt-4 inline-block text-sm font-semibold underline text-primary">Manage program</Link>
          </article>;
        })}
        {family.isSuccess&&!family.data?.registrations.length&&
          <p className="border border-border bg-card p-4 text-sm">No registered family enrichment programs in this guardian workspace.</p>}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">School admissions and student academic records are separate from enrichment registration.</p>
      <Link to="/guardian/students" className="inline-block mt-2 text-sm underline text-primary">My students and school experience</Link>
    </section>}
    {student&&<section className="mt-7" aria-label="Current school classes">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-2xl">My Classes</h2>
        <Link to="/student/courses" className="text-sm underline text-primary">Class registration</Link>
      </div>
      {school.isPending&&<p role="status" className="mt-3 text-sm">Loading your enrolled classes…</p>}
      {school.isError&&<p role="alert" className="mt-3 border border-border p-3 text-sm">School courses are unavailable in the current student workspace.</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {activeSchool.map(item=><article key={item.id} className="border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{item.code} · Enrolled</p>
          <h3 className="mt-2 font-serif text-xl">{item.title}</h3>
          <Link to="/student/courses" search={{section:item.id}} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold underline text-primary">
            <BookOpen size={14} aria-hidden="true"/>Open class</Link>
        </article>)}
        {school.isSuccess&&!activeSchool.length&&<p className="border border-border bg-card p-4 text-sm">No current classes are assigned to this student account.</p>}
      </div>
    </section>}
    {!adult&&!guardian&&!student&&<section className="mt-6 border border-border bg-card p-5">
      <h2 className="font-serif text-xl">Your authorized workspaces</h2>
      <p className="mt-2 text-sm text-muted-foreground">Open My CAN to select an independently verified learning, guardian or staff role. This workspace does not acquire another person's permissions automatically.</p>
      <Link to="/account" className="mt-3 inline-block text-sm font-semibold text-primary underline">Manage my workspaces</Link>
    </section>}
  </WorkspaceShell>;
}
