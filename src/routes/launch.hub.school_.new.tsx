import { createFileRoute } from "@tanstack/react-router";
import { CreateSchoolProfile } from "@/components/launch-studio/CreateSchoolProfile";
import { listLaunchOptions } from "@/modules/programs/launch.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
export const Route=createFileRoute("/launch/hub/school_/new")({
  loader:safeLoader(()=>listLaunchOptions()),
  component:CreateSchoolPage,
});
function CreateSchoolPage(){
  const result=Route.useLoaderData();
  if(!result.ok)return <LoaderFailure title="Create your school" outcome={result}/>;
  return <CreateSchoolProfile options={result.data}/>;
}
