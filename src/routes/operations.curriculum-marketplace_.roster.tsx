import { createFileRoute } from "@tanstack/react-router";
import { loadMarketplace, MarketView } from "@/routes/operations.curriculum-marketplace";
import { uuidProgramSelectionSchema } from "@/lib/route-search";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/operations/curriculum-marketplace_/roster")({
  validateSearch: (search: Record<string, unknown>) => uuidProgramSelectionSchema.parse(search),
  loaderDeps: ({ search }) => ({ programId: search.programId }),
  loader: ({ deps }) => loadMarketplace(deps.programId),
  component: CurriculumRosterPage,
});

function CurriculumRosterPage() {
  const outcome = Route.useLoaderData();
  if (!outcome.ok) return <LoaderFailure title="Roster exchange" outcome={outcome}/>;
  return <MarketView key={outcome.data.marketplace?.program.id ?? "none"} data={outcome.data} mode="roster"/>;
}