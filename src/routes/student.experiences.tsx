import { createFileRoute } from "@tanstack/react-router";
import { StudentQuickWins } from "@/components/student/StudentQuickWins";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getQuickWinActions } from "@/modules/_demo/quick-wins.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

const loadExperiences = async () => { const [quickWins,school] = await Promise.all([getQuickWinActions(),getSchoolExperiences()]); return {quickWins,school}; };

export const Route = createFileRoute("/student/experiences")({
  loader: safeLoader(loadExperiences, { authMessage: "Sign in with an authorized student account to view your experiences." }),
  component: StudentExperiencesPage,
});

function StudentExperiencesPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure eyebrow="CAN OS · Synthetic student" title="Student experiences" outcome={outcome} />;
  const { quickWins, school } = outcome.data;
  const { connected, actions } = quickWins;
  return <><LiveQuickWins connected={connected} actions={actions}/><LiveSchoolExperiences data={school}/><StudentQuickWins /></>;
}
