import { createFileRoute } from "@tanstack/react-router";
import { loadMarketplace, MarketView } from "@/routes/operations.curriculum-marketplace";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/curriculum-marketplace_/resources")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => loadMarketplace(deps.programId),
  component: CurriculumResourcesPage,
});

function CurriculumResourcesPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Curriculum resources" outcome={outcome}/>;
  return <MarketView key={outcome.data.marketplace?.program.id ?? "none"} data={outcome.data} mode="resources"/>;
}