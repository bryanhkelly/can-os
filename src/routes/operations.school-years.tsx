import { createFileRoute } from "@tanstack/react-router";
import { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolYearStudioWorkspace } from "@/components/operations/SchoolYearStudioWorkspace";

export const Route = createFileRoute("/operations/school-years")({
  loader: safeLoader(() => getSchoolYearStudio(), { authMessage: "Sign in as an authorized academic registrar." }),
  component: SchoolYearStudio,
});

function SchoolYearStudio() {
  const result = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Academic time" title="School-year setup" outcome={result} />;
  return <SchoolYearStudioWorkspace key={JSON.stringify(selection)} data={result.data} selection={selection} />;
}
