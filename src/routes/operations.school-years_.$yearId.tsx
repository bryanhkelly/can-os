import { createFileRoute, Link } from "@tanstack/react-router";
import { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolYearRecord, schoolYearTabs, type SchoolYearTab } from "@/components/operations/SchoolYearRecord";
import { EmptyState, WorkspaceShell } from "@/components/workspace";

export const Route = createFileRoute("/operations/school-years_/$yearId")({
  validateSearch: (search: Record<string, unknown>): { tab?: SchoolYearTab } => ({
    tab: schoolYearTabs.find(tab => tab.value === search.tab && tab.value !== "overview")?.value,
  }),
  loader: safeLoader(() => getSchoolYearStudio(), { authMessage: "Sign in as an authorized academic registrar." }),
  component: SchoolYearPage,
});

function SchoolYearPage() {
  const result = Route.useLoaderData();
  const { yearId } = Route.useParams();
  const { tab = "overview", siteId, programId } = Route.useSearch();
  const scope = { siteId, programId };
  if (!result.ok) return <LoaderFailure eyebrow="School years" title="School year" outcome={result} />;
  const year = result.data.years.find(candidate => candidate.id === yearId);
  if (!year) return <WorkspaceShell eyebrow="School years" title="School year not found"
    breadcrumbs={<Link to="/operations/school-years" search={scope} className="underline">School years</Link>}>
    <EmptyState title="This school year is unavailable" description="It may not exist, or it is outside the sites and programs you are authorized to manage." />
  </WorkspaceShell>;
  const siteName = result.data.sites.find(site => site.id === year.siteId)?.name;
  return <SchoolYearRecord key={year.id} year={year} siteName={siteName} tab={tab} scope={scope} />;
}