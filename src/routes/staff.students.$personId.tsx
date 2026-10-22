import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStudent360 } from "@/modules/profiles/directory.functions";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { WorkspaceShell, WorkspacePanel, DetailNavigation, StatCard, StatusBadge, PersonMark } from "@/components/workspace";

const tabs = ["overview", "academics", "activity", "attendance", "support", "relationships"] as const;
type ProfileTab = (typeof tabs)[number];
export const Route = createFileRoute("/staff/students/$personId")({
  validateSearch: (search: Record<string, unknown>): { tab?: ProfileTab } => ({
    tab: tabs.find(tab => tab === search.tab),
  }),
  component: Student360Route,
});
type Student360 = Awaited<ReturnType<typeof getStudent360>>;

function Student360Route() {
  const { personId } = Route.useParams();
  return <Student360Page key={personId} personId={personId}/>;
}

function Student360Page({ personId }: { personId: string }) {
  const [profile, setProfile] = useState<Student360 | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getStudent360({ data: { studentPersonId: personId } }).then(result => {
      if (active) setProfile(result);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : "Unable to open this authorized student profile.");
    });
    return () => { active = false; };
  }, [personId]);
  const { tab = "overview" } = Route.useSearch();
  if (profile) return <Student360View profile={profile} tab={tab}/>;
  return <WorkspaceShell eyebrow="CAN OS · Staff" title="Student profile">
    {error ? <p role="alert" className="mt-6 rounded-lg border p-4">{error}</p> :
      <p role="status" className="mt-6">Loading student profile...</p>}
  </WorkspaceShell>;
}

export function Student360View({ profile, tab = "overview" }: { profile: Student360; tab?: ProfileTab }) {
  const canOpenReferrals = ["teacher", "specialist", "counselor"].includes(profile.viewerRole);
  return <WorkspaceShell width="wide" eyebrow="CAN OS · Staff" title={profile.identity.name}
    subtitle={`Grade ${profile.identity.gradeLevel ?? "not recorded"} · ${profile.sections.length} active class(es)`}
    breadcrumbs={<><Link to="/staff/students" className="underline">Students</Link><span>/</span><span>{profile.identity.name}</span></>}
    actions={<ProfilePhoto personId={profile.identity.personId} name={profile.identity.name}/>}
    rail={<WorkspacePanel title="Record context">
      <p className="text-sm leading-6 text-muted-foreground">This profile contains the records returned by your authorized staff view. Private notes and domain decisions remain in their owning workflows.</p>
      <Link to="/messages" className="mt-4 inline-block text-sm underline">Open staff inbox</Link>
    </WorkspacePanel>}>
    <DetailNavigation label="Student profile sections">{tabs.map(value => <Link key={value}
      to="/staff/students/$personId" params={{ personId: profile.identity.personId }} search={{ tab: value }}
      aria-current={tab === value ? "page" : undefined} className="capitalize">{value}</Link>)}</DetailNavigation>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="Missing work" value={profile.academics.openMissingWorkCount}/>
      <StatCard label="Absences · last 30 days" value={profile.attendance.absenceCount}/>
      <StatCard label="Open actions" value={profile.openActions.length}/>
    </div>
    <div className="grid gap-5">
      {(tab === "overview" || tab === "academics") && <WorkspacePanel title="Academics" description="Finalized results, not estimated progress or mastery.">
        <ul className="divide-y">{profile.academics.sections.map(section => <li key={section.sectionId} className="py-4 first:pt-0">
          <h3 className="font-semibold">{section.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{section.letterGrade !== null || section.percentage !== null ?
            `Finalized grade: ${section.letterGrade ?? ""}${section.letterGrade && section.percentage !== null ? " · " : ""}${section.percentage !== null ? `${section.percentage}%` : ""}` :
            "No finalized grade yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Teaching team: {profile.sections.find(item => item.sectionId === section.sectionId)?.teacherNames.join(", ") || "Not recorded"}</p>
        </li>)}</ul>
        {!profile.academics.sections.length && <p className="text-sm text-muted-foreground">No active sections.</p>}
      </WorkspacePanel>}
      {(tab === "overview" || tab === "activity") && <WorkspacePanel title="Academic activity"
       description="Chronological class-grade, recorded-attendance and academic-follow-up events from only your authorized school scope. Private case notes are excluded.">
        <ol className="divide-y">
         {profile.timeline.map(item=><li key={item.id} className="py-3 text-sm">
           <div className="flex flex-wrap items-baseline justify-between gap-2">
             <p className="font-semibold">{item.title}</p>
             <time className="text-xs text-muted-foreground" dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
           </div>
           <p className="mt-1 text-muted-foreground">{item.detail}</p>
         </li>)}
        </ol>
        {!profile.timeline.length&&<p className="text-sm text-muted-foreground">No academic activity has been recorded in the authorized view.</p>}
      </WorkspacePanel>}
      {(tab === "overview" || tab === "attendance") && <WorkspacePanel title="Attendance" description="Recent recorded events from the last 30 days.">
        <p className="text-sm">{profile.attendance.absenceCount} absence(s) · {profile.attendance.tardyCount} tardy event(s)</p>
        <ul className="mt-3 divide-y">{profile.attendance.recentEvents.map((event, index) => <li key={`${event.expectedAt}-${index}`} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
          <StatusBadge tone={event.status === "absent" ? "attention" : "neutral"}>{event.status}</StatusBadge>
          <span>{new Date(event.expectedAt).toLocaleDateString()}{event.sectionTitle ? ` · ${event.sectionTitle}` : ""}</span>
        </li>)}</ul>
        {!profile.attendance.recentEvents.length && <p className="mt-3 text-sm text-muted-foreground">No recent attendance events.</p>}
      </WorkspacePanel>}
      {(tab === "overview" || tab === "support") && <>
        <WorkspacePanel title="Open actions">
          <ul className="space-y-3">{profile.openActions.map(action => <li key={action.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{action.type==="support_referral"
              ?canOpenReferrals
                ?<Link to="/support" search={{referral:action.id}} className="hover:underline">{action.title}</Link>
                :action.title
              :profile.viewerRole==="registrar"||action.type==="academic_intervention"
                ?<Link to="/actions/$actionId" params={{actionId:action.id}} className="hover:underline">{action.title}</Link>
                :action.title}</h3>
              <StatusBadge tone={action.priority === "high" || action.priority === "urgent" ? "attention" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge></div>
            <p className="mt-2 text-sm text-muted-foreground">{action.type.replaceAll("_", " ")}{action.dueAt ? ` · Due ${new Date(action.dueAt).toLocaleDateString()}` : ""}</p>
          </li>)}</ul>
          {!profile.openActions.length && <p className="text-sm text-muted-foreground">No open actions for this student.</p>}
        </WorkspacePanel>
        <WorkspacePanel title="Support referrals">
          <ul className="space-y-3">{profile.supportReferrals.map(referral => <li key={referral.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{canOpenReferrals
              ?<Link to="/support" search={{referral:referral.id}} className="hover:underline">{referral.title}</Link>
              :referral.title}</h3><StatusBadge>{referral.stage.replaceAll("_", " ")}</StatusBadge></div>
            <p className="mt-2 text-sm text-muted-foreground">{referral.category} · Opened {new Date(referral.createdAt).toLocaleDateString()}</p>
          </li>)}</ul>
          {!profile.supportReferrals.length && <p className="text-sm text-muted-foreground">No open support referrals.</p>}
        </WorkspacePanel>
        <WorkspacePanel title="Recent insights">
          <ul className="space-y-3">{profile.insights.map(insight => <li key={insight.id} className="rounded-lg border p-4">
            <h3 className="font-semibold"><Link to="/operations/insights" search={{insight:insight.id}} className="hover:underline">{insight.title}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{insight.type.replaceAll("_", " ")} · {new Date(insight.createdAt).toLocaleDateString()}</p>
          </li>)}</ul>
          {!profile.insights.length && <p className="text-sm text-muted-foreground">No insights recorded for this student.</p>}
        </WorkspacePanel>
      </>}
      {tab === "relationships" && <WorkspacePanel title="Guardians">
        <ul className="space-y-3">{profile.guardians.map((guardian, index) => <li key={index} className="flex items-center gap-3 rounded-lg border p-4">
          <PersonMark name={guardian.name}/><div><h3 className="font-semibold">{guardian.name}</h3><p className="mt-1 text-sm capitalize text-muted-foreground">{guardian.relationshipLabel}</p></div>
        </li>)}</ul>
        {!profile.guardians.length && <p className="text-sm text-muted-foreground">No guardians on record.</p>}
      </WorkspacePanel>}
    </div>
  </WorkspaceShell>;
}
