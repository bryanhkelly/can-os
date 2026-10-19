import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFamilyHome, getGuardianNeedsYou } from "@/modules/family/family-home.functions";
import { WorkspaceShell, EmptyState, QueryState, StatCard, PersonMark, StatusBadge } from "@/components/workspace";
import { prioritizeFamilyNeeds } from "@/domain/family-needs";

export const Route = createFileRoute("/guardian/")({
 validateSearch:(search:Record<string,unknown>):{action?:string}=>({
  action:typeof search.action==="string"?search.action:undefined,
 }),
 component:FamilyHomePage,
});

type Child = Awaited<ReturnType<typeof getFamilyHome>>["children"][number];
type NeedItem = Awaited<ReturnType<typeof getGuardianNeedsYou>>["items"][number];

function FamilyHomePage() {
 const {action}=Route.useSearch();
 const [children, setChildren] = useState<Child[]>([]);
 const [needs, setNeeds] = useState<NeedItem[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState("");

 useEffect(() => {
  let active = true;
  Promise.all([getFamilyHome(), getGuardianNeedsYou()]).then(([home, needsYou]) => {
   if (!active) return;
   setChildren(home.children);
   setNeeds(needsYou.items);
   setLoading(false);
  }).catch(() => {
   if (active) { setError("Sign in with an authorized guardian account to view your family home."); setLoading(false); }
  });
  return () => { active = false; };
 }, []);

 return <FamilyHomeView children={children} needs={needs} loading={loading} error={error} action={action}/>;
}

export function FamilyHomeView({children,needs,loading,error,action}:{
 children:Child[];needs:NeedItem[];loading:boolean;error:string;action?:string;
}){
 const prioritized=prioritizeFamilyNeeds(needs,Date.now());
 return <WorkspaceShell
  width="wide"
  eyebrow="CAN OS · Family"
  title="Family home"
  subtitle="Everything that needs your attention across your children, in one place."
  actions={<Link to="/messages" className="rounded-lg border bg-card px-4 py-2 text-sm font-semibold">Family inbox</Link>}
 >
  <QueryState loading={loading ? "Loading your family…" : ""} error={error}>
   <div className="mt-7 grid gap-3 sm:grid-cols-3">
    <StatCard label="Your children" value={children.length}/>
    <StatCard label="Needs your attention" value={needs.length}/>
    <StatCard label="Missing assignments" value={children.reduce((total,child)=>total+child.missingCount,0)}/>
   </div>
   <section aria-label="Needs you" className="mt-10">
    <div className="flex items-baseline justify-between gap-3">
     <h2 className="text-lg font-semibold">Needs you</h2>
     {needs.length > 0 && <span className="rounded-full border px-3 py-1 text-xs">{needs.length} open</span>}
    </div>
    {needs.length === 0 && <EmptyState className="mt-4 bg-card" title="You are all caught up. Nothing needs your attention right now." />}
    {needs.length > 0 && <div className="mt-4 grid gap-3">
     {prioritized.filter(item=>!action||item.kind==="action"&&item.id===action).map(item => {
      const Container=action?"article":Link;
      return <Container key={`${item.kind}-${item.id}`} to={item.href} href={action?undefined:item.href} className="block rounded-xl border bg-card p-5 transition-colors hover:bg-muted">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.type.replaceAll("_", " ")}</p>
        <p className="mt-1 font-semibold">{item.title}</p>
        {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
        {"dueAt" in item&&item.dueAt&&<p className="mt-2 text-xs text-muted-foreground">Due {new Date(item.dueAt).toLocaleDateString()}</p>}
       </div>
       <span className="rounded-full border px-3 py-1 text-xs">
        {item.kind === "excuse" ? "Submit excuse" : item.kind === "action" ? (action?"Selected action":"Review action") : "View"}
       </span>
      </div>
     </Container>;})}
    </div>}
    {action&&<Link to="/guardian" className="mt-4 inline-block text-sm underline">View all family needs</Link>}
    {action&&!needs.some(item=>item.kind==="action"&&item.id===action)&&!loading&&<p role="alert" className="mt-4 rounded-xl border p-4">This action is unavailable in your current family workspace.</p>}
   </section>

   <section aria-label="Your children" className="mt-12">
    <h2 className="text-lg font-semibold">Your children</h2>
    {children.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No students are connected to your account yet.</p>}
    {children.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
     {children.map(child => <article key={child.studentProfileId} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div className="flex items-start gap-3">
        <PersonMark name={`${child.displayName} ${child.lastName}`}/>
        <div>
        <h3 className="text-lg font-semibold"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="hover:underline">{child.displayName} {child.lastName}</Link></h3>
        <p className="mt-1 text-xs text-muted-foreground">{child.awaitingSections ? "Program enrollment active; classes not assigned yet" : `${child.sectionCount} active ${child.sectionCount === 1 ? "class" : "classes"}`}</p>
        </div>
       </div>
       <StatusBadge tone={child.status==="on_track"?"success":"attention"}>
        {child.status === "awaiting_courses" ? "Enrolled · awaiting classes" : child.status === "on_track" ? "On track" : "Needs attention"}
       </StatusBadge>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="underline">Missing</Link></dt><dd className="text-lg font-semibold">{child.missingCount}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="underline">Absences</Link></dt><dd className="text-lg font-semibold">{child.unexcusedAbsences}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground"><Link to="/guardian/academics" search={{student:child.studentPersonId}} className="underline">Next due</Link></dt><dd className="text-sm font-semibold">{child.nextDueAt ? new Date(child.nextDueAt).toLocaleDateString() : "—"}</dd></div>
      </dl>
      <p className="mt-4 text-sm text-muted-foreground">{child.awaitingSections?"Your school is arranging class placement.":child.missingCount>0?`${child.missingCount} assignment(s) need follow-through.`:child.unexcusedAbsences>0?"An absence needs your review.":"No missing work or unexcused absences in this summary."}</p>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={`${child.displayName} links`}>
       <Link to="/guardian/academics" search={{student:child.studentPersonId}} className="rounded-full border px-3 py-1 hover:bg-muted">Academics</Link>
       <Link to="/guardian/attendance" search={{student:child.studentPersonId}} className="rounded-full border px-3 py-1 hover:bg-muted">Attendance</Link>
       <Link to="/guardian/report-cards" search={{student:child.studentPersonId}} className="rounded-full border px-3 py-1 hover:bg-muted">Report cards</Link>
       <Link to="/guardian/admission-offers" search={{student:child.studentPersonId}} className="rounded-full border px-3 py-1 hover:bg-muted">Offers</Link>
      </nav>
     </article>)}
    </div>}
   </section>

   <section aria-label="Family shortcuts" className="mt-12">
    <h2 className="text-lg font-semibold">Family</h2>
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
     <Link to="/ask" className="rounded-full border px-4 py-2 hover:bg-muted">Ask CAN</Link>
     <Link to="/guardian/group-permissions" className="rounded-full border px-4 py-2 hover:bg-muted">Study group permissions</Link>
     <Link to="/guardian/watching" className="rounded-full border px-4 py-2 hover:bg-muted">Things CAN Is Watching</Link>
     <Link to="/guardian/admission-offers" search={{student:undefined}} className="rounded-full border px-4 py-2 hover:bg-muted">Admission offers</Link>
     <Link to="/messages" className="rounded-full border px-4 py-2 hover:bg-muted">Messages</Link>
     <Link to="/notifications" className="rounded-full border px-4 py-2 hover:bg-muted">Notifications</Link>
    </div>
   </section>
  </QueryState>
 </WorkspaceShell>;
}
