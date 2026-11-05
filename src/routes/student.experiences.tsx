import { createFileRoute, Link } from "@tanstack/react-router";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { WorkspaceShell } from "@/components/workspace";

// School announcements, events and conferences belong to /student/my-school.
const loadExperiences = async (action?: string) => ({
  quickWins: await getQuickWinActions({data:{actionId:action}}),
});

export const Route = createFileRoute("/student/experiences")({
  validateSearch: (search: Record<string, unknown>): { action?: string } => ({
    action: typeof search.action === "string" ? search.action : undefined,
  }),
  loaderDeps: ({ search }) => ({ action: search.action }),
  loader: ({ deps }) => safeLoader(() => loadExperiences(deps.action), {
    authMessage: "Sign in with an authorized student account to view your experiences.",
  })(),
  component: StudentExperiencesPage,
});

function StudentExperiencesPage() {
  const outcome = Route.useLoaderData();
  const { action } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="Student" title="Student experiences" outcome={outcome} />;
  const { quickWins } = outcome.data;
  const { connected, actions } = quickWins;
  return <WorkspaceShell width="wide" eyebrow="Student" title="Your actions"
    subtitle="Your saved actions and next steps."
    breadcrumbs={<Link to="/home" className="underline">Student Today</Link>}>
    <LiveQuickWins key={action??"all"} connected={connected} actions={actions} actionId={action}/>
  </WorkspaceShell>;
}
