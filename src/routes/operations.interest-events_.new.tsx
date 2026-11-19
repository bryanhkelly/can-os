import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InterestEventsWorkspace } from "@/routes/operations.interest-events";
import { listSchoolInterestEvents } from "@/modules/enrollment/interest-events.functions";
import {
  listSiteMarketingPackagesV61, readSiteMarketingSuggestionsV61,
} from "@/modules/programs/site-marketing-packages-v61.functions";
import { containsProtectedInstitutionalClaim } from "@/domain/site-local-content";
import { siteProgramSelectionSchema } from "@/lib/route-search";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * An event is independently governed and Program-linked. Only its editable
 * starting title comes from the same saved Site Marketing Package or the
 * reviewed editorial projection used in Launch Studio. Nothing is sent or
 * created by this read; no campaign, event or Story is copied into a new store.
 */
const eventCreateSearchSchema=siteProgramSelectionSchema.extend({
  packageId:z.string().uuid().optional(),
});
export const Route = createFileRoute("/operations/interest-events_/new")({
  validateSearch: (search: Record<string, unknown>) => eventCreateSearchSchema.parse(search),
  loaderDeps: ({search})=>({siteId:search.siteId,packageId:search.packageId}),
  loader: ({deps})=>safeLoader(async()=>{
    const data=await listSchoolInterestEvents();
    const authorizedSite=deps.siteId &&
      data.programs.some(program=>program.siteId===deps.siteId);
    if(!authorizedSite)return {data,suggestedTitle:null,source:null};
    const packages=deps.packageId
      ? await listSiteMarketingPackagesV61({data:{siteId:deps.siteId!}}).catch(()=>null)
      : null;
    const selected=packages?.find(item=>
      item.id===deps.packageId && item.siteId===deps.siteId &&
      item.status==="draft" && item.content.purpose==="event-invitation");
    const savedHeadline=selected?.content.headline?.trim()??"";
    if(savedHeadline && !containsProtectedInstitutionalClaim(savedHeadline))
      return {data,suggestedTitle:savedHeadline,source:"saved-package" as const};
    const suggestions=await readSiteMarketingSuggestionsV61({data:{siteId:deps.siteId!}})
      .catch(()=>null);
    const suggestion=suggestions?.["event-invitation"].content.headline??null;
    return {data,suggestedTitle:suggestion,source:suggestion?"establish":"none"};
  },{authMessage:"Sign in as an authorized school administrator to create an event."})(),
  component: CreateInterestEventPage,
});

function CreateInterestEventPage() {
  const outcome = Route.useLoaderData();
  const selection = Route.useSearch();
  if (!outcome.ok) return <LoaderFailure eyebrow="School launch" title="Create interest event" outcome={outcome}/>;
  return <InterestEventsWorkspace key={JSON.stringify(selection)}
    data={outcome.data.data} selection={selection} mode="create"
    suggestedTitle={outcome.data.suggestedTitle}
    titleSource={outcome.data.source}/>;
}
