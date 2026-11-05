import { createFileRoute } from "@tanstack/react-router";
import { CurriculumView, loadCurriculum } from "@/routes/operations.curriculum";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/curriculum_/$courseId")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => loadCurriculum(deps.programId),
  component: CourseAuthoringPage,
});

function CourseAuthoringPage() {
  const outcome = Route.useLoaderData();
  const { courseId } = Route.useParams();
  if (!outcome.ok) return <LoaderFailure title="Course authoring" outcome={outcome}/>;
  return <CurriculumView key={`${outcome.data.studio?.programId}:${courseId}`} data={outcome.data} mode="author" courseId={courseId}/>;
}