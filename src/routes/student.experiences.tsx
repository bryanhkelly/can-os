import { createFileRoute } from "@tanstack/react-router";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getQuickWinActions } from "@/modules/actions/student-actions.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadExperiences = async (action?: string) => {
  const [quickWins,school] = await Promise.all([
    getQuickWinActions(), action ? Promise.resolve(null) : getSchoolExperiences(),
  ]);
  return {quickWins,school};
};

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
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Student" title="Student experiences" outcome={outcome} />;
  const { quickWins, school } = outcome.data;
  const { connected, actions } = quickWins;
  return <><LiveQuickWins key={action??"all"} connected={connected} actions={actions} actionId={action}/>{school&&<LiveSchoolExperiences data={school}/>}</>;
}
