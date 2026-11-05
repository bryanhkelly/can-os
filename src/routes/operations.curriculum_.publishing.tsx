import { createFileRoute } from "@tanstack/react-router";
import { CurriculumView, loadCurriculum } from "@/routes/operations.curriculum";
import { optionalSearchString, uuidProgramSelectionSchema } from "@/lib/route-search";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/curriculum_/publishing")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.extend({ course: optionalSearchString }).parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => loadCurriculum(deps.programId),
  component: CurriculumPublishingPage,
});

function CurriculumPublishingPage() {
  const outcome = Route.useLoaderData();
  const { course } = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure title="Publish curriculum" outcome={outcome}/>;
  return <CurriculumView key={`${outcome.data.studio?.programId}:${course ?? "packs"}`} data={outcome.data} mode="publish" courseId={course}/>;
}