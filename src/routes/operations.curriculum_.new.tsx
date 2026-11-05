import { createFileRoute } from "@tanstack/react-router";
import { CurriculumView, loadCurriculum } from "@/routes/operations.curriculum";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/curriculum_/new")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => loadCurriculum(deps.programId),
  component: CreateCoursePage,
});

function CreateCoursePage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Create course" outcome={outcome}/>;
  return <CurriculumView key={outcome.data.studio?.programId ?? "none"} data={outcome.data} mode="create"/>;
}