import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { academicHubStatus, complianceHubStatus, plannedHubStatus, websiteHubStatus, type SchoolHubStatus } from "@/domain/school-hub-status";
import type { SchoolHubModule } from "@/domain/school-launch-hub";
import { listLaunchOptions, listLaunches } from "./launch.functions";

/** Module read errors are explicit UI states, never empty records or invented status. */
function readFailureStatus(module: string): SchoolHubStatus {
  return {state:"Unavailable",detail:`${module} records could not be loaded. No readiness is assumed.`,nextAction:"Retry this module"};
}
export const getSchoolHubData=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({siteId:z.string().optional(),programId:z.string().optional(),
  module:z.enum(["profile","information","website","team","promote","recruitment","events","academics","compliance"]).optional()}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const canonicalCatalogEnabled=process.env.CAN_CANONICAL_CATALOG_ENABLED==="true";
  const actor=await getCommandContext(getRequest());assertCapability(actor,"program.read");
  if(!hasRegistrarAuthority(actor.role))throw new AuthorizationError("school launch workspace");
  const options=await listLaunchOptions();
  if(!data.siteId)return {options,launches:null,statuses:null,selectedProgramId:null,selectionError:null,canonicalCatalogEnabled};
  if(!z.string().uuid().safeParse(data.siteId).success)
    return {options,launches:null,statuses:null,selectedProgramId:null,canonicalCatalogEnabled,
      selectionError:"This link contains an invalid school identifier. Select an authorized school."};
  const site=options.sites.find(site=>site.id===data.siteId);
  // An unauthorized or stale Site selector returns the authorized picker.
  if(!site || (actor.grantSiteId && actor.grantSiteId!==site.id))
    return {options,launches:null,statuses:null,selectedProgramId:null,selectionError:null,canonicalCatalogEnabled};
  // Planned modules are real route destinations. They do not need a database read
  // or a fictional operational workflow just to render their landing page.
  if(data.module==="promote"||data.module==="recruitment"||data.module==="events")
    return {options,launches:null,selectedProgramId:null,selectionError:null,canonicalCatalogEnabled,
      statuses:{[data.module]:plannedHubStatus} as Partial<Record<SchoolHubModule,SchoolHubStatus>>};
  const needsPrograms=!data.module || data.module==="academics" || data.module==="compliance";
  const needsWebsite=!data.module || data.module==="website";
  const needsTeam=!data.module || data.module==="team";
  const [programRead,websiteRead,teamRead]=await Promise.allSettled([
   needsPrograms ? (async()=>{const result=await listLaunches({data:{includeActive:true}});return result.launches.filter(program=>program.siteId===site.id);})() : Promise.resolve(null),
   needsWebsite ? (async()=>{
    const [{db},s,{eq,desc}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
    const {requirePartnerWebsiteEditor}=await import("@/modules/sites/site-website-authorization.server");
    try {await requirePartnerWebsiteEditor(actor);}catch(error){if(error instanceof AuthorizationError)return {state:"Blocked",detail:"Use the authorized school website approval workspace for this membership or network.",nextAction:"Review website access"} satisfies SchoolHubStatus;throw error;}
    const [content]=await db.select({status:s.siteLocalContentVersions.status}).from(s.siteLocalContentVersions)
     .where(eq(s.siteLocalContentVersions.siteId,site.id)).orderBy(desc(s.siteLocalContentVersions.revision)).limit(1);
    return websiteHubStatus(site.websiteDraft?.status??null,content?.status??null);
   })() : Promise.resolve(null),
   needsTeam ? (async()=>{
    const [{db},s,{and,eq,sql}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
    const grants=await db.select({personId:s.accountPersonGrants.personId,active:s.accountPersonGrants.active})
     .from(s.accountPersonGrants).innerJoin(s.people,eq(s.people.id,s.accountPersonGrants.personId))
     .where(and(eq(s.accountPersonGrants.siteId,site.id),eq(s.accountPersonGrants.organizationId,site.organizationId),eq(s.people.active,true),
      sql`(${s.accountPersonGrants.active} = true OR (EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregate_type = 'StaffInvitation' AND e.aggregate_id = ${s.accountPersonGrants.id} AND e.event_type = 'StaffInvitationIssued') AND NOT EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregate_type = 'StaffInvitation' AND e.aggregate_id = ${s.accountPersonGrants.id} AND e.event_type = 'StaffInvitationAccepted')))`));
    const active=new Set(grants.filter(grant=>grant.active).map(grant=>grant.personId));
    const pending=grants.filter(grant=>!grant.active).length;
    return {state:pending||[...active].some(id=>id!==actor.actorPersonId)?"In Progress":"Not Started",detail:`${active.size} active members · ${pending} pending invitations`,nextAction:pending?"Review pending invitations":"Invite your school team"} satisfies SchoolHubStatus;
   })() : Promise.resolve(null),
  ]);
  // Preserve an explicit failed-read signal. Never replace an errored read with
  // Not Started, an empty list, or stale information.
  for(const [module,result] of [["Programs",programRead],["Website",websiteRead],["Team",teamRead]] as const)
    if(result.status==="rejected")console.error("School Hub read failed", {module});
  const launches=programRead.status==="fulfilled" ? programRead.value : null;
  const website=websiteRead.status==="fulfilled" ? websiteRead.value : null;
  const team=teamRead.status==="fulfilled" ? teamRead.value : null;
  const invalidProgram=Boolean(needsPrograms && data.programId &&
    (!z.string().uuid().safeParse(data.programId).success || (launches && !launches.some(program=>program.id===data.programId))));
  const selectedProgramId=invalidProgram?null:(needsPrograms?data.programId??(launches?.length===1?launches[0]!.id:null):null);
  const statuses:Partial<Record<SchoolHubModule,SchoolHubStatus>>={};
  if(needsWebsite)statuses.website=websiteRead.status==="rejected"?readFailureStatus("Website"):website!;
  if(needsTeam)statuses.team=teamRead.status==="rejected"?readFailureStatus("Team"):team!;
  if(needsPrograms){
    if(!data.module || data.module==="academics")statuses.academics=programRead.status==="rejected"?readFailureStatus("Academic"):academicHubStatus(launches!);
    if(!data.module || data.module==="compliance")statuses.compliance=programRead.status==="rejected"?readFailureStatus("Compliance"):complianceHubStatus(launches!);
  }
  if(!data.module)
    for(const module of ["promote","recruitment","events"] as const)
      statuses[module]=plannedHubStatus;
  return {options,launches,selectedProgramId,statuses,canonicalCatalogEnabled,
    selectionError:invalidProgram?"The requested Program is not available at this school. Choose an authorized Program.":null};
 });
