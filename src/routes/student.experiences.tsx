import { createFileRoute } from "@tanstack/react-router";
import { StudentQuickWins } from "@/components/student/StudentQuickWins";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { LiveSchoolExperiences } from "@/components/student/LiveSchoolExperiences";
import { getSchoolExperiences } from "@/modules/student-experience/school-experiences.functions";
import { getQuickWinActions } from "@/modules/student-experience/quick-wins.functions";

export const Route = createFileRoute("/student/experiences")({
  loader: async () => { const [quickWins,school] = await Promise.all([getQuickWinActions(),getSchoolExperiences()]); return {quickWins,school}; },
  component: StudentExperiencesPage,
});

function StudentExperiencesPage() {
  const { quickWins, school } = Route.useLoaderData();
  const { connected, actions } = quickWins;
  return <><LiveQuickWins connected={connected} actions={actions}/><LiveSchoolExperiences data={school}/><StudentQuickWins /></>;
}
