import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { InterestEventsWorkspace } from "@/routes/operations.interest-events";
import { listSchoolInterestEvents } from "@/modules/enrollment/interest-events.functions";
import {
  listSiteMarketingPackagesV61, readSiteMarketingSuggestionsV61,
} from "@/modules/programs/site-marketing-packages-v61.functions";
import { containsProtectedInstitutionalClaim } from "@/domain/site-local-content";
import { DomainError } from "@/domain/errors";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

/**
 * An event is independently governed and Program-linked. Only its editable
 * starting title comes from the same saved Site Marketing Package or the
 * reviewed editorial projection used in Launch Studio. Nothing is sent or
 * created by this read; no campaign, event or Story is copied into a new store.
 */
const eventCreateSearchSchema=z.object({
  siteId:z.string().uuid().optional(),
  programId:z.string().uuid().optional(),
  packageId:z.string().uuid().optional(),
});
export const Route = createFileRoute("/operations/interest-events_/new")({
  validateSearch: (search: Record<string, unknown>) => eventCreateSearchSchema.parse(search),
  loaderDeps: ({search})=>({
    siteId:search.siteId,programId:search.programId,packageId:search.packageId,
  }),
  loader: ({deps})=>safeLoader(async()=>{
    const data=await listSchoolInterestEvents();
    // A Launch handoff must never silently fall back to a different Site or
    // Program when its explicit selection is stale or outside the grant.
    if(deps.siteId && !data.programs.some(program=>program.siteId===deps.siteId))
      throw new DomainError("UNAVAILABLE","No authorized Programs are available at the requested Site.");
    if(deps.programId && !data.programs.some(program=>
      program.id===deps.programId && (!deps.siteId || program.siteId===deps.siteId)))
      throw new DomainError("UNAVAILABLE","The requested Program does not belong to the selected Site.");
    if(deps.packageId && !deps.siteId)
      throw new DomainError("UNAVAILABLE","Choose the Marketing Package's Site before creating an event.");
    if(!deps.siteId)return {data,suggestedTitle:null,suggestedDescription:null,source:null};
    const packages=deps.packageId
      ? await listSiteMarketingPackagesV61({data:{siteId:deps.siteId!}}).catch(()=>null)
      : null;
    const selected=packages?.find(item=>
      item.id===deps.packageId && item.siteId===deps.siteId &&
      item.status==="draft" && item.content.purpose==="event-invitation");
    if(deps.packageId && !selected)
      throw new DomainError("UNAVAILABLE","This event invitation Package is unavailable or archived at the selected Site.");
    const savedHeadline=selected?.content.headline.trim()??"";
    const savedMessage=selected?.content.message.trim()??"";
    const safeTitle=(value:string)=>value.length>=3 && value.length<=160 &&
      !/[<>\\r\\n]/.test(value) && !containsProtectedInstitutionalClaim(value);
    const safeMessage=(value:string)=>value.length<=2000 &&
      !/[<>]/.test(value) && !containsProtectedInstitutionalClaim(value);
    // A requested package must be usable as authored; do not replace a
    // protected or incomplete saved message with unrelated generic content.
    if(selected){
      if(!safeTitle(savedHeadline) || !safeMessage(savedMessage))
        throw new DomainError("VALIDATION_FAILED",
          "Review the invitation Package wording before creating an event.");
      return {data,suggestedTitle:savedHeadline,suggestedDescription:savedMessage,
        source:"saved-package" as const};
    }
    const suggestions=await readSiteMarketingSuggestionsV61({data:{siteId:deps.siteId}})
      .catch(()=>null);
    const candidate=suggestions?.["event-invitation"].content;
    const suggestedTitle=candidate && safeTitle(candidate.headline)?candidate.headline:null;
    const suggestedDescription=candidate && safeMessage(candidate.message)?candidate.message:null;
    return {data,suggestedTitle,suggestedDescription,
      source:suggestedTitle?"establish" as const:"none" as const};
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
    suggestedDescription={outcome.data.suggestedDescription}
    titleSource={outcome.data.source}/>;
}
