import { createFileRoute, redirect } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace";
import { workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { optionalSearchString, siteProgramSelectionSchema } from "@/lib/route-search";
import { isValidDateOnly } from "@/modules/calendar/timezone";

const StudentHome = lazy(() => import("@/components/home/StudentHome").then(module => ({ default: module.StudentHome })));
const TeacherHome = lazy(() => import("@/components/home/TeacherHome").then(module => ({ default: module.TeacherHome })));
const FamilyHome = lazy(() => import("@/components/home/GuardianHome").then(module => ({ default: module.FamilyHomePage })));
const OperationsHome = lazy(() => import("@/components/home/OperationsHome").then(module => ({ default: module.OperationsHome })));
const SiteDayHome = lazy(() => import("@/components/operations/SiteDayPage").then(module => ({ default: module.SiteDayPage })));
const CoachHome = lazy(() => import("@/components/home/CoachHome").then(module => ({ default: module.CoachPage })));
const ProfileHome = lazy(() => import("./profiles").then(module => ({ default: module.ProfileHome })));
const SafeguardingHome = lazy(() => import("./safeguarding").then(module => ({ default: module.SafeguardingHome })));
const WebsiteHome = lazy(() => import("./site-website").then(module => ({ default: module.WebsiteHome })));
const NetworkHome = lazy(() => import("@/components/home/NetworkHome").then(module => ({ default: module.NetworkHome })));
const StewardHome = lazy(() => import("@/components/home/StewardHome").then(module => ({ default: module.CANPartnerDesk })));
const JurisdictionReviewerDesk = lazy(() => import("@/components/operations/CANSchoolJurisdictionReviewDesk")
  .then(module => ({ default: module.CANSchoolJurisdictionReviewDesk })));

const homeSearchSchema = siteProgramSelectionSchema.extend({
  action: optionalSearchString,
  student: optionalSearchString,
  gradeAction: optionalSearchString,
  case: optionalSearchString,
  person: z.string().uuid().optional(),
  returnGrantId: optionalSearchString,
  view: z.enum(["onsite"]).optional(),
  date: z.string().refine(isValidDateOnly, "Invalid school date").optional(),
});
type HomeSearch = z.infer<typeof homeSearchSchema>;

// Role selects presentation only. Every reader still enforces the active server access context.
export async function loadHomeDashboard(role: string, search: HomeSearch) {
    if (search.view === "onsite") {
      if (!["site_leader", "site_staff", "room_facilitator"].includes(role)) {
        return { kind: "unavailable", message: "This workspace cannot operate the onsite school day. Select your authorized onsite membership." } as const;
      }
      return { kind: "site-day" } as const;
    }
  switch (role) {
    case "student":
      return { kind: "student", outcome: await (await import("@/components/home/StudentHome")).loadStudentHome() } as const;
    case "teacher":
      return { kind: "teacher", outcome: await (await import("@/components/home/TeacherHome")).loadTeacherHome() } as const;
    case "registrar":
    case "site_admin":
      return { kind: "operations", outcome: await (await import("@/components/home/OperationsHome")).loadOperationsHome({
        siteId: search.siteId, programId: search.programId,
      }) } as const;
    case "paraeducator":
      return { kind: "profile", outcome: await (await import("./profiles")).loadProfileHome(search.person) } as const;
    case "safeguarding_responder":
    case "safeguarding_lead":
      return { kind: "safeguarding", outcome: await (await import("./safeguarding")).loadSafeguardingHome() } as const;
    case "site_website_editor":
      return { kind: "website", outcome: await (await import("./site-website")).loadWebsiteHome(search.siteId) } as const;
    case "network_admin":
      return { kind: "network", outcome: await (await import("@/components/home/NetworkHome")).loadNetworkHome() } as const;
    case "can_network_steward":
      return { kind: "steward", outcome: await (await import("@/components/home/StewardHome")).loadStewardHome() } as const;
    case "can_jurisdiction_reviewer":
      return { kind: "jurisdiction-review" } as const;
    case "guardian":
      return { kind: "guardian" } as const;
    case "specialist":
    case "counselor":
      return { kind: "coach", title: role === "counselor" ? "Counselor caseload" : "Specialist caseload" } as const;
    case "room_facilitator":
    case "site_staff":
    case "site_leader":
      return { kind: "site-day" } as const;
    default:
      return { kind: "unavailable", message: "Your account has no active CAN OS workspace. Contact your school administrator." } as const;
  }
}

export const Route = createFileRoute("/home")({
  validateSearch: (search: Record<string, unknown>) => homeSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps, location }) => {
    const { session, error } = await context.queryClient.fetchQuery(workspaceSessionQueryOptions());
    if (session && !session.authenticated) {
      throw redirect({ to: "/access", search: { returnTo: location.href } });
    }
    if (error || !session) {
      return { kind: "unavailable", message: error ?? "Unable to load your workspace session. Please try again." } as const;
    }
    if (session.role === "academic_content_creator") throw redirect({to:"/canonical/content"});
    if (session.role === "academic_content_reviewer") throw redirect({to:"/canonical/content-reviews"});
    return loadHomeDashboard(session.role, deps);
  },
  component: HomePage,
});

function HomePage() {
  const dashboard = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const loading = <WorkspaceShell title="Home"><p role="status">Loading your home...</p></WorkspaceShell>;
  return <Suspense fallback={loading}>
    {(() => {
      switch (dashboard.kind) {
        case "student": return <StudentHome result={dashboard.outcome} />;
        case "teacher": return <TeacherHome outcome={dashboard.outcome} gradeAction={search.gradeAction} />;
        case "operations": return <OperationsHome result={dashboard.outcome} selected={search} />;
        case "guardian": return <FamilyHome action={search.action} student={search.student} />;
        case "site-day": return <SiteDayHome key={(search.siteId ?? "") + (search.date ?? "")} selection={{ siteId: search.siteId, date: search.date }} />;
        case "coach": return <CoachHome key={search.student ?? "all"} title={dashboard.title}
          studentProfileId={search.student} selectStudent={student => void navigate({ search: { student } })} />;
        case "profile": return <ProfileHome outcome={dashboard.outcome} />;
        case "safeguarding": return <SafeguardingHome outcome={dashboard.outcome} search={search} />;
        case "website": return <WebsiteHome outcome={dashboard.outcome} selection={search} />;
        case "network": return <NetworkHome result={dashboard.outcome} />;
        case "steward": return <StewardHome outcome={dashboard.outcome} />;
        case "jurisdiction-review": return <WorkspaceShell width="wide" eyebrow="CAN Jurisdiction"
          title="School-specific jurisdiction reviews"
          subtitle="Independently review current official requirements and submitted school evidence.">
          <JurisdictionReviewerDesk />
        </WorkspaceShell>;
        case "unavailable": return <WorkspaceShell title="Home"><p role="alert">{dashboard.message}</p></WorkspaceShell>;
      }
    })()}
  </Suspense>;
}
