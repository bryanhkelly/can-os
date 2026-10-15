import { createFileRoute } from "@tanstack/react-router";
import { StudentQuickWins } from "@/components/student/StudentQuickWins";
import { LiveQuickWins } from "@/components/student/LiveQuickWins";
import { getQuickWinActions } from "@/modules/student-experience/quick-wins.functions";

export const Route = createFileRoute("/student/experiences")({
  loader: () => getQuickWinActions(),
  component: StudentExperiencesPage,
});

function StudentExperiencesPage() {
  const { connected, actions } = Route.useLoaderData();
  return <><LiveQuickWins connected={connected} actions={actions}/><StudentQuickWins /></>;
}
