import { createFileRoute } from "@tanstack/react-router";
import { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SchoolYearCreateForm } from "@/components/operations/SchoolYearCreateForm";

export const Route = createFileRoute("/operations/school-years_/new")({
  loader: safeLoader(() => getSchoolYearStudio(), { authMessage: "Sign in as an authorized academic registrar." }),
  component: CreateSchoolYear,
});

function CreateSchoolYear() {
  const result = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!result.ok) return <LoaderFailure eyebrow="School years" title="Create school year" outcome={result} />;
  return <SchoolYearCreateForm key={JSON.stringify(selection)} data={result.data} selection={selection} />;
}
