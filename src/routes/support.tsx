import { createFileRoute } from "@tanstack/react-router";
import { getSupportReferrals, getSupportViewerRole } from "@/modules/support/support-referrals.functions";
import { AuthorizationError } from "@/domain/command-context";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";
import { SupportView } from "./student.support";
export const Route=createFileRoute("/support")({
  validateSearch:(search:Record<string,unknown>):{referral?:string}=>({referral:typeof search.referral==="string"?search.referral:undefined}),
  loader:safeLoader(async()=>{
    const {role}=await getSupportViewerRole();
    if(role!=="specialist"&&role!=="counselor")throw new AuthorizationError("support professional workspace");
    return {role,referrals:await getSupportReferrals()};
  },{authMessage:"Sign in as an authorized counselor or specialist."}),
  component:SupportWorkspace,
});
function SupportWorkspace(){
  const outcome=Route.useLoaderData();
  const search=Route.useSearch();
  if(!outcome.ok)return <LoaderFailure title="Student support" outcome={outcome}/>;
  return <SupportView key={search.referral??"all"} referrals={outcome.data.referrals} role={outcome.data.role} search={search} route="/support"/>;
}
