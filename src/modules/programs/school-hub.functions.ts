import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { academicHubStatus, complianceHubStatus, unavailableHubStatus, websiteHubStatus, type SchoolHubStatus } from "@/domain/school-hub-status";
import { listLaunchOptions, listLaunches } from "./launch.functions";
async function optionalRead<T>(read:()=>Promise<T>) {try{return await read();}catch{return null;}}
export const getSchoolHubData=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({siteId:z.string().uuid().optional(),programId:z.string().uuid().optional()}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());assertCapability(actor,"program.read");
  if(!hasRegistrarAuthority(actor.role))throw new AuthorizationError("school launch workspace");
  const options=await listLaunchOptions();
  if(!data.siteId)return {options,launches:null,statuses:null,selectedProgramId:null};
  const site=options.sites.find(site=>site.id===data.siteId);
  if(!site || (actor.grantSiteId && actor.grantSiteId!==site.id))throw new AuthorizationError("selected school Hub scope");
  const [{db},s,{and,eq,desc,sql}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  const [launches,website,team]=await Promise.all([
   optionalRead(async()=>{const result=await listLaunches({data:{includeActive:true}});return result.launches.filter(program=>program.siteId===site.id);}),
   optionalRead(async()=>{
    const {requirePartnerWebsiteEditor}=await import("@/modules/sites/site-website-authorization.server");
    try {await requirePartnerWebsiteEditor(actor);}catch(error){if(error instanceof AuthorizationError)return {state:"Blocked",detail:"Use the authorized school website approval workspace for this membership or network.",nextAction:"Review website access"} satisfies SchoolHubStatus;throw error;}
    const [content]=await db.select({status:s.siteLocalContentVersions.status}).from(s.siteLocalContentVersions)
     .where(eq(s.siteLocalContentVersions.siteId,site.id)).orderBy(desc(s.siteLocalContentVersions.revision)).limit(1);
    return websiteHubStatus(site.websiteDraft?.status??null,content?.status??null);
   }),
   optionalRead(async()=>{
    const grants=await db.select({personId:s.accountPersonGrants.personId,active:s.accountPersonGrants.active})
     .from(s.accountPersonGrants).innerJoin(s.people,eq(s.people.id,s.accountPersonGrants.personId))
     .where(and(eq(s.accountPersonGrants.siteId,site.id),eq(s.accountPersonGrants.organizationId,site.organizationId),eq(s.people.active,true),
      sql`(${s.accountPersonGrants.active} = true OR (EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregate_type = 'StaffInvitation' AND e.aggregate_id = ${s.accountPersonGrants.id} AND e.event_type = 'StaffInvitationIssued') AND NOT EXISTS (SELECT 1 FROM domain_events e WHERE e.aggregate_type = 'StaffInvitation' AND e.aggregate_id = ${s.accountPersonGrants.id} AND e.event_type = 'StaffInvitationAccepted')))`));
    const active=new Set(grants.filter(grant=>grant.active).map(grant=>grant.personId));
    const pending=grants.filter(grant=>!grant.active).length;
    return {state:pending||[...active].some(id=>id!==actor.actorPersonId)?"In Progress":"Not Started",detail:`${active.size} active members · ${pending} pending invitations`,nextAction:pending?"Review pending invitations":"Invite your school team"} satisfies SchoolHubStatus;
   }),
  ]);
  if(data.programId && launches && !launches.some(program=>program.id===data.programId))throw new AuthorizationError("selected Program belongs to this school");
  const selectedProgramId=data.programId??(launches?.length===1?launches[0]!.id:null);
  const planned:SchoolHubStatus={state:"Blocked",detail:"Site-level tools are not available yet.",nextAction:"Review planned resources"};
  return {options,launches,selectedProgramId,statuses:{website:website??unavailableHubStatus,team:team??unavailableHubStatus,promote:planned,recruitment:planned,events:planned,
   academics:launches?academicHubStatus(launches):unavailableHubStatus,compliance:launches?complianceHubStatus(launches):unavailableHubStatus}};
 });
