import { createFileRoute, Link } from "@tanstack/react-router";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { LiveSchoolExperiences, type SchoolExperienceView } from "@/components/student/LiveSchoolExperiences";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { WorkspaceShell, EmptyState, DetailNavigation, SectionTab, StatusBadge, WorkspacePanel } from "@/components/workspace";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const tabs = [
  { value: "overview", label: "Overview" },
  { value: "calendar", label: "Calendar" },
  { value: "announcements", label: "Announcements" },
  { value: "conferences", label: "Teacher conferences" },
] as const satisfies readonly { value: SchoolExperienceView; label: string }[];
type SchoolTab = (typeof tabs)[number]["value"];

export const Route = createFileRoute("/student/my-school")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolTab } => ({
    tab: tabs.find(tab => tab.value === search.tab)?.value,
  }),
  loader: safeLoader(() => getSchoolExperiences(), {
    authMessage: "Sign in as an enrolled student to see your school community.",
  }),
  component: MySchoolPage,
});

function schoolInitials(name: string) {
  return name.split(/\s+/).filter(word => /^[A-Za-z]/.test(word)).slice(0, 2).map(word => word[0]!.toUpperCase()).join("") || "S";
}

function MySchoolPage() {
  const outcome = Route.useLoaderData();
  const { tab = "overview" } = Route.useSearch();
  const { session } = useWorkspaceSession();
  if (!outcome.ok) return <LoaderFailure eyebrow="My School" title="My School" outcome={outcome} />;
  const schoolNames = session?.authenticated ? session.sites.map(site => site.name) : [];
  const schoolName = schoolNames.length === 1 ? schoolNames[0]! : "My School";
  return <WorkspaceShell width="wide" eyebrow="My School" title={schoolName}
    subtitle={schoolNames.length > 1 ? schoolNames.join(" · ")
      : schoolNames.length ? "Your school's calendar, announcements and teacher conferences."
      : "Your local school will appear here when it is connected to your student account."}
    actions={<div className="flex items-start gap-4">
      {outcome.data.connected
        ? <StatusBadge tone="success">School updates connected</StatusBadge>
        : <StatusBadge tone="attention">School updates unavailable</StatusBadge>}
      <span aria-hidden="true" data-school-mark="" className="grid size-16 shrink-0 place-items-center rounded-lg border bg-muted font-serif text-2xl text-muted-foreground">
        {schoolInitials(schoolName)}
      </span>
    </div>}
    rail={<WorkspacePanel title="At school">
      <ul className="space-y-2 text-sm">
        <li><Link to="/student/courses" className="underline">My classes</Link></li>
        <li><Link to="/student/study-groups" className="underline">Study Groups</Link></li>
        <li><Link to="/calendar" className="underline">Full school calendar</Link></li>
      </ul>
    </WorkspacePanel>}>
    <DetailNavigation label="School sections">{tabs.map(item => <SectionTab key={item.value} current={tab === item.value}
      link={{ to: "/student/my-school", search: item.value === "overview" ? {} : { tab: item.value } }}>{item.label}</SectionTab>)}</DetailNavigation>
    {outcome.data.connected
      ? <LiveSchoolExperiences data={outcome.data} view={tab}
        moreLink={(section, total) => <Link to="/student/my-school" search={{ tab: section }} className="inline-block text-sm font-semibold underline">
          View all {total} {tabs.find(item => item.value === section)!.label.toLowerCase()}</Link>} />
      : <EmptyState title="School experiences are temporarily unavailable" description="Your school calendar and announcements could not be loaded. Try again later." />}
  </WorkspaceShell>;
}