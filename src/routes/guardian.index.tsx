import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFamilyHome, getGuardianNeedsYou } from "@/modules/family/family-home.functions";
import { WorkspaceShell, EmptyState, QueryState } from "@/components/workspace";

export const Route = createFileRoute("/guardian/")({ component: FamilyHomePage });

type Child = Awaited<ReturnType<typeof getFamilyHome>>["children"][number];
type NeedItem = Awaited<ReturnType<typeof getGuardianNeedsYou>>["items"][number];

function FamilyHomePage() {
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

 return <WorkspaceShell
  eyebrow="CAN OS · Family"
  title="Family home"
  subtitle="Everything that needs your attention across your children, in one place."
 >
  <QueryState loading={loading ? "Loading your family…" : ""} error={error}>
   <section aria-label="Needs you" className="mt-10">
    <div className="flex items-baseline justify-between gap-3">
     <h2 className="text-lg font-semibold">Needs you</h2>
     {needs.length > 0 && <span className="rounded-full border px-3 py-1 text-xs">{needs.length} open</span>}
    </div>
    {needs.length === 0 && <EmptyState className="mt-4 bg-card" title="You are all caught up. Nothing needs your attention right now." />}
    {needs.length > 0 && <div className="mt-4 grid gap-3">
     {needs.map(item => <Link key={`${item.kind}-${item.id}`} to={item.href} className="block rounded-xl border bg-card p-4 transition-colors hover:bg-muted">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.type.replaceAll("_", " ")}</p>
        <p className="mt-1 font-semibold">{item.title}</p>
        {item.detail && <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>}
       </div>
       <span className="rounded-full border px-3 py-1 text-xs">
        {item.kind === "excuse" ? "Submit excuse" : item.kind === "action" ? "Open task" : "View"}
       </span>
      </div>
     </Link>)}
    </div>}
   </section>

   <section aria-label="Your children" className="mt-12">
    <h2 className="text-lg font-semibold">Your children</h2>
    {children.length === 0 && <p className="mt-4 text-sm text-muted-foreground">No students are connected to your account yet.</p>}
    {children.length > 0 && <div className="mt-4 grid gap-4 sm:grid-cols-2">
     {children.map(child => <article key={child.studentProfileId} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
       <div>
        <h3 className="text-lg font-semibold">{child.displayName} {child.lastName}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{child.awaitingSections ? "Program enrollment active; classes not assigned yet" : `${child.sectionCount} active ${child.sectionCount === 1 ? "class" : "classes"}`}</p>
       </div>
       <span className={`rounded-full border px-3 py-1 text-xs ${child.status === "on_track" ? "" : "border-amber-500 text-amber-600"}`}>
        {child.status === "awaiting_courses" ? "Enrolled · awaiting classes" : child.status === "on_track" ? "On track" : "Needs attention"}
       </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground">Missing</dt><dd className="text-lg font-semibold">{child.missingCount}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground">Absences</dt><dd className="text-lg font-semibold">{child.unexcusedAbsences}</dd></div>
       <div className="rounded-lg bg-muted p-2"><dt className="text-xs text-muted-foreground">Next due</dt><dd className="text-sm font-semibold">{child.nextDueAt ? new Date(child.nextDueAt).toLocaleDateString() : "—"}</dd></div>
      </dl>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm" aria-label={`${child.displayName} links`}>
       <a href={"/guardian/academics?student="+encodeURIComponent(child.studentPersonId)} className="rounded-full border px-3 py-1 hover:bg-muted">Academics</a>
       <Link to="/guardian/attendance" className="rounded-full border px-3 py-1 hover:bg-muted">Attendance</Link>
       <a href={"/guardian/report-cards?student="+encodeURIComponent(child.studentPersonId)} className="rounded-full border px-3 py-1 hover:bg-muted">Report cards</a>
      </nav>
     </article>)}
    </div>}
   </section>

   <section aria-label="Family shortcuts" className="mt-12">
    <h2 className="text-lg font-semibold">Family</h2>
    <div className="mt-4 flex flex-wrap gap-3 text-sm">
     <Link to="/ask" className="rounded-full border px-4 py-2 hover:bg-muted">Ask CAN</Link>
     <Link to="/guardian/study-group-consent" className="rounded-full border px-4 py-2 hover:bg-muted">Study group permissions</Link>
     <Link to="/guardian/watching" className="rounded-full border px-4 py-2 hover:bg-muted">Things CAN Is Watching</Link>
     <Link to="/guardian/admission-offers" className="rounded-full border px-4 py-2 hover:bg-muted">Admission offers</Link>
     <Link to="/messages" className="rounded-full border px-4 py-2 hover:bg-muted">Messages</Link>
     <Link to="/notifications" className="rounded-full border px-4 py-2 hover:bg-muted">Notifications</Link>
    </div>
   </section>
  </QueryState>
 </WorkspaceShell>;
}
