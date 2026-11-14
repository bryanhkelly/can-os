import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getStudent360 } from "@/modules/profiles/directory.functions";
import { getProfilePhoto } from "@/modules/profiles/person-profile.functions";
import { ProfilePhoto } from "@/components/profiles/ProfilePhoto";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { PageFrame, RecordHeader, RecordLayout, WorkspaceShell, WorkspacePanel, SectionTab, StatCard, StatusBadge, QueryState } from "@/components/workspace";
import { plural } from "@/lib/format";

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
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    getStudent360({ data: { studentPersonId: personId } }).then(result => {
      if (active) setProfile(result);
    }).catch(cause => {
      if (active) setError(mutationErrorMessage(cause, "Unable to open this authorized student profile."));
    });
    return () => { active = false; };
  }, [personId, revision]);
  const { tab = "overview" } = Route.useSearch();
  if (profile) return <Student360View profile={profile} tab={tab}/>;
  return <WorkspaceShell eyebrow="Staff" title="Student profile">
    <QueryState loading={!error && "Loading student profile..."} error={error || undefined}
      onRetry={() => { setError(""); setRevision(value => value + 1); }} />
  </WorkspaceShell>;
}

export function Student360View({ profile, tab = "overview" }: { profile: Student360; tab?: ProfileTab }) {
  const canOpenReferrals = ["teacher", "specialist", "counselor"].includes(profile.viewerRole);
  const preview = <T,>(items: T[]) => tab === "overview" ? items.slice(0, 3) : items;
  const sectionLink = (value: ProfileTab, label: string) => <Link to="/staff/students/$personId"
    params={{ personId: profile.identity.personId }} search={{ tab: value }}
    className="text-sm text-primary underline underline-offset-4">{label}</Link>;
  const activityGroups = new Map<string, Student360["timeline"]>();
  for (const item of profile.timeline) {
    const month = new Date(item.at).toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const items = activityGroups.get(month) ?? [];
    items.push(item);
    activityGroups.set(month, items);
  }
  return <PageFrame width="wide">
    <RecordLayout header={<RecordHeader eyebrow="Staff" title={profile.identity.name} focusOnMount
      subtitle={`Grade ${profile.identity.gradeLevel ?? "not recorded"} · ${plural(profile.sections.length, "active class", "active classes")}`}
      breadcrumbs={<Link to="/staff/students" className="underline">All students</Link>}
      leading={<ProfilePhoto personId={profile.identity.personId} name={profile.identity.name} readPhoto={getProfilePhoto}/>}/ >}
    navigation={tabs.map(value => <SectionTab key={value} current={tab === value} className="capitalize"
      link={{ to: "/staff/students/$personId", params: { personId: profile.identity.personId }, search: { tab: value } }}>{value}</SectionTab>)}
    main={<>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      <StatCard label="Missing work" value={profile.academics.openMissingWorkCount}/>
      <StatCard label="Absences · last 30 days" value={profile.attendance.absenceCount}/>
      <StatCard label="Active classes" value={profile.sections.length}/>
    </div>
    <div className="grid gap-5">
      {(tab === "overview" || tab === "academics") && <WorkspacePanel title="Academics"
        actions={tab === "overview" && sectionLink("academics", `View all ${plural(profile.academics.sections.length, "class", "classes")}`)}>
        <ul className="divide-y">{preview(profile.academics.sections).map(section => <li key={section.sectionId} className="py-4 first:pt-0">
          <h3 className="font-semibold"><Link to="/classes" search={{ section: section.sectionId }} className="underline underline-offset-4">{section.title}</Link></h3>
          <p className="mt-1 text-sm text-muted-foreground">{section.letterGrade !== null || section.percentage !== null ?
            `Finalized grade: ${section.letterGrade ?? ""}${section.letterGrade && section.percentage !== null ? " · " : ""}${section.percentage !== null ? `${section.percentage}%` : ""}` :
            "No finalized grade yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">Teaching team: <TeacherNameLinks teachers={profile.sections.find(item => item.sectionId === section.sectionId)?.teachers ?? []}/></p>
        </li>)}</ul>
        {!profile.academics.sections.length && <p className="text-sm text-muted-foreground">No active sections.</p>}
      </WorkspacePanel>}
      {(tab === "overview" || tab === "activity") && <WorkspacePanel title="Academic activity"
       actions={tab === "overview" && sectionLink("activity", "View academic activity")}>
        {tab === "overview" ? <AcademicActivityList items={preview(profile.timeline)}/> :
          <div className="divide-y">{[...activityGroups].map(([month, items], index) => <details key={month} open={index === 0} className="py-3 first:pt-0">
            <summary className="cursor-pointer text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">{month} · {plural(items.length, "event")}</summary>
            <AcademicActivityList items={items}/>
          </details>)}</div>}
        {!profile.timeline.length&&<p className="text-sm text-muted-foreground">No academic activity has been recorded in the authorized view.</p>}
      </WorkspacePanel>}
      {(tab === "overview" || tab === "attendance") && <WorkspacePanel title="Attendance" description="Last 30 days"
        actions={tab === "overview" && sectionLink("attendance", "View attendance")}>
        <p className="text-sm">{plural(profile.attendance.absenceCount, "absence", "absences")} · {plural(profile.attendance.tardyCount, "tardy event")}</p>
        <ul className="mt-3 divide-y">{preview(profile.attendance.recentEvents).map((event, index) => <li key={`${event.expectedAt}-${index}`} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
          <StatusBadge tone={event.status === "absent" ? "attention" : "neutral"}>{event.status}</StatusBadge>
          <span>{new Date(event.expectedAt).toLocaleDateString()}{event.sectionTitle ? ` · ${event.sectionTitle}` : ""}</span>
        </li>)}</ul>
        {!profile.attendance.recentEvents.length && <p className="mt-3 text-sm text-muted-foreground">No recent attendance events.</p>}
      </WorkspacePanel>}
      {tab === "support" && <>
        <WorkspacePanel title="Open actions">
          <ul className="divide-y">{profile.openActions.map(action => <li key={action.id} className="py-4 first:pt-0">
            <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{action.type==="support_referral"
              ?canOpenReferrals
                ?<Link to={profile.viewerRole === "teacher" ? "/student/support" : "/support"} search={{referral:action.id}} className="hover:underline">{action.title}</Link>
                :action.title
              :hasRegistrarAuthority(profile.viewerRole)||action.type==="academic_intervention"
                ?<Link to="/actions/$actionId" params={{actionId:action.id}} className="hover:underline">{action.title}</Link>
                :action.title}</h3>
              <StatusBadge tone={action.priority === "high" || action.priority === "urgent" ? "attention" : "neutral"}>{action.status.replaceAll("_", " ")}</StatusBadge></div>
            <p className="mt-2 text-sm text-muted-foreground">{action.type.replaceAll("_", " ")}{action.dueAt ? ` · Due ${new Date(action.dueAt).toLocaleDateString()}` : ""}</p>
          </li>)}</ul>
          {!profile.openActions.length && <p className="text-sm text-muted-foreground">No open actions for this student.</p>}
        </WorkspacePanel>
        <WorkspacePanel title="Support referrals">
          <ul className="divide-y">{profile.supportReferrals.map(referral => <li key={referral.id} className="py-4 first:pt-0">
            <div className="flex flex-wrap justify-between gap-3"><h3 className="font-semibold">{canOpenReferrals
              ?<Link to={profile.viewerRole === "teacher" ? "/student/support" : "/support"} search={{referral:referral.id}} className="hover:underline">{referral.title}</Link>
              :referral.title}</h3><StatusBadge>{referral.stage.replaceAll("_", " ")}</StatusBadge></div>
            <p className="mt-2 text-sm text-muted-foreground">{referral.category} · Opened {new Date(referral.createdAt).toLocaleDateString()}</p>
          </li>)}</ul>
          {!profile.supportReferrals.length && <p className="text-sm text-muted-foreground">No open support referrals.</p>}
        </WorkspacePanel>
        <WorkspacePanel title="Recent insights">
          <ul className="divide-y">{profile.insights.map(insight => <li key={insight.id} className="py-4 first:pt-0">
            <h3 className="font-semibold"><Link to="/operations/insights" search={{insight:insight.id}} className="hover:underline">{insight.title}</Link></h3><p className="mt-1 text-sm text-muted-foreground">{insight.type.replaceAll("_", " ")} · {new Date(insight.createdAt).toLocaleDateString()}</p>
          </li>)}</ul>
          {!profile.insights.length && <p className="text-sm text-muted-foreground">No insights recorded for this student.</p>}
        </WorkspacePanel>
      </>}
      {tab === "relationships" && <WorkspacePanel title="Guardians">
        <ul className="divide-y">{profile.guardians.map((guardian, index) => <li key={index} className="flex items-center gap-3 py-4 first:pt-0">
          <ProfilePhoto personId={guardian.personId} name={guardian.name} size="compact" readPhoto={getProfilePhoto}/><div className="min-w-0 wrap-break-word"><h3 className="font-semibold"><Link to="/profiles" search={{person:guardian.personId}} className="underline underline-offset-4">{guardian.name}</Link></h3><p className="mt-1 text-sm capitalize text-muted-foreground">{guardian.relationshipLabel}</p></div>
        </li>)}</ul>
        {!profile.guardians.length && <p className="text-sm text-muted-foreground">No guardians on record.</p>}
      </WorkspacePanel>}
    </div>
    </>}
    rail={<>
      <WorkspacePanel title="Teaching team">
        <ul className="divide-y">{profile.sections.slice(0, 3).map(section => <li key={section.sectionId} className="py-3 first:pt-0">
          <p className="text-sm font-semibold"><Link to="/classes" search={{ section: section.sectionId }} className="underline underline-offset-2">{section.title}</Link></p>
          <p className="mt-1 text-sm text-muted-foreground"><TeacherNameLinks teachers={section.teachers}/></p>
        </li>)}</ul>
        {!profile.sections.length && <p className="text-sm text-muted-foreground">No active teaching assignments.</p>}
        {profile.sections.length > 3 && sectionLink("academics", "View all teaching assignments")}
      </WorkspacePanel>
      <WorkspacePanel title="Student record">
        <div className="flex flex-col items-start gap-4">
          {sectionLink("relationships", "Family relationships")}
          {sectionLink("support", "Actions and support")}
        </div>
      </WorkspacePanel>
    </>} />
  </PageFrame>;
}

function AcademicActivityList({ items }: { items: Student360["timeline"] }) {
  return <ol className="divide-y">{items.map(item => <li key={item.id} className="py-3 text-sm">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <p className="font-semibold">{item.title}</p>
      <time className="text-xs text-muted-foreground" dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
    </div>
    <p className="mt-1 text-muted-foreground">{item.detail}</p>
  </li>)}</ol>;
}

function TeacherNameLinks({ teachers }: { teachers: Student360["sections"][number]["teachers"] }) {
  if (!teachers.length) return <>Not recorded</>;
  return <>{teachers.map((teacher, index) => <span key={teacher.personId}>{index > 0 && ", "}
    <Link to="/profiles" search={{ person: teacher.personId }} className="underline underline-offset-2">{teacher.name}</Link>
  </span>)}</>;
}
