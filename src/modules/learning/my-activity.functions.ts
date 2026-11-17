import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {z} from "zod";
import {AuthorizationError} from "@/domain/command-context";
import {readWorkspaceSession} from "@/modules/identity/workspace-session.server";
import {
  PARTICIPATION_READ_MODEL_VERSION,assertParticipationReadModel,
  type ParticipationReadModel,type ParticipationRecord,type ParticipationSource,
  type ActivitySource,type ParticipationOpportunity,
} from "@/domain/participation-read-model";
import {
  assembleParticipation,projectNativeClasses,projectNoncreditCourses,
  projectNoncreditOpportunities,
} from "@/domain/participation-projections";
import {getMyNativeClassHistoryForCanAccountPage} from
  "@/modules/classes/native-class-enrollment.functions";
import {getMyNoncreditSelfEnrollmentHistoryPage} from
  "@/modules/enrollment/noncredit-self-enrollment.functions";
import {getMyNoncreditWaitlist} from
  "@/modules/enrollment/noncredit-waitlist.functions";
import {getMyAccountSchoolParticipationPage} from
  "./account-school-participation.functions";

const participationSource=z.enum([
  "school_section","school_program","calendar_event",
  "family_enrichment","native_class","noncredit_course",
]);
const accountSchoolSources=new Set<ParticipationSource>([
  "school_section","school_program","calendar_event","family_enrichment",
]);
const pagedInput=z.object({
  source:participationSource,
  cursor:z.string().min(2).max(500).nullable().default(null),
}).strict();
const firstPageSources=participationSource.options;
const outputCursor=(value:object|null)=>value?JSON.stringify(value):null;
function parseCursor(value:string|null):unknown{
  if(value===null)return null;
  try{return JSON.parse(value)}catch{
    throw new AuthorizationError("valid source history cursor");
  }
}
function privateRead(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}
async function readSourcePage(
  source:ParticipationSource,
  rawCursor:string|null,
  now:Date,
  siteChoices:readonly {id:string;name:string}[],
):Promise<{items:ParticipationRecord[];nextCursor:string|null}>{
  const cursor=parseCursor(rawCursor);
  if(accountSchoolSources.has(source)){
    const result=await getMyAccountSchoolParticipationPage({
      data:{source:source as "school_section"|"school_program"|"calendar_event"|"family_enrichment",
        cursor:cursor as {createdAt:string;id:string}|null},
    });
    return {items:result.items,nextCursor:outputCursor(result.nextCursor)};
  }
  if(source==="native_class"){
    const result=await getMyNativeClassHistoryForCanAccountPage({
      data:{cursor:cursor as {enrolledAt:string;classEnrollmentId:string}|null},
    });
    return {
      items:projectNativeClasses(result.items,now,siteChoices),
      nextCursor:outputCursor(result.nextCursor),
    };
  }
  const result=await getMyNoncreditSelfEnrollmentHistoryPage({
    data:{cursor:cursor as {registeredAt:string;registrationId:string}|null},
  });
  return {
    items:projectNoncreditCourses(result.items,now),
    nextCursor:outputCursor(result.nextCursor),
  };
}

/** Every continuation rechecks the active CAN session AND the original
 * source's own grant, Person and relationship access. No submitted Person,
 * Organization or Site can widen the history read. */
export const getMyActivitySourcePage=createServerFn({method:"GET"})
  .validator((raw:unknown)=>pagedInput.parse(raw))
  .handler(async({data})=>{
    privateRead();
    const session=await readWorkspaceSession(getRequest());
    if(!session.authenticated)throw new AuthorizationError("verified CAN account");
    const result=await readSourcePage(
      data.source,data.cursor,new Date(),session.sites,
    );
    return {...result,source:data.source};
  });

/** Initial page from every source. A bounded response is not represented as
 * a complete history when more source pages exist; older records remain
 * reachable through getMyActivitySourcePage, without a new ledger. */
export const getMyActivity=createServerFn({method:"GET"})
  .handler(async():Promise<ParticipationReadModel>=>{
    privateRead();
    const session=await readWorkspaceSession(getRequest());
    if(!session.authenticated)throw new AuthorizationError("verified CAN account");
    const now=new Date();
    const records:ParticipationRecord[]=[];
    const opportunities:ParticipationOpportunity[]=[];
    const nextCursors:Partial<Record<ParticipationSource,string>>={};
    const sources:ParticipationReadModel["sources"]=[];
    const tasks:Array<Promise<void>>=[];
    for(const source of firstPageSources){
      tasks.push((async()=>{
        try{
          const page=await readSourcePage(source,null,now,session.sites);
          records.push(...page.items);
          if(page.nextCursor)nextCursors[source]=page.nextCursor;
          sources.push({
            source,state:"ready",
            coverage:page.nextCursor?"partial":"complete",
            message:page.nextCursor?"Older records available. Load more Activity pages.":null,
          });
        }catch{
          // Never report unauthorized/unavailable sources as an empty history.
          sources.push({source,state:"unavailable",coverage:"unknown",
            message:"This source could not be verified with the current access."});
        }
      })());
    }
    tasks.push((async()=>{
      try{
        opportunities.push(...projectNoncreditOpportunities(await getMyNoncreditWaitlist()));
        // Waitlist is not participation. Its personal source may still be
        // bounded, so it is intentionally not certified as complete.
        sources.push({source:"noncredit_waitlist",state:"ready",
          coverage:"partial",message:"Waiting-list history is source-managed."});
      }catch{
        sources.push({source:"noncredit_waitlist",state:"unavailable",
          coverage:"unknown",message:"Waiting-list source could not be verified."});
      }
    })());
    await Promise.all(tasks);
    const order:ActivitySource[]=[...firstPageSources,"noncredit_waitlist"];
    sources.sort((a,b)=>order.indexOf(a.source)-order.indexOf(b.source));
    const result:ParticipationReadModel={
      version:PARTICIPATION_READ_MODEL_VERSION,generatedAt:now.toISOString(),
      viewerRole:session.role,activeGrantId:session.activeGrantId,
      records:assembleParticipation(records),opportunities,sources,nextCursors,
    };
    assertParticipationReadModel(result);
    return result;
  });
