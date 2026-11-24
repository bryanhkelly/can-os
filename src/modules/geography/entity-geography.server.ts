import {sql,type SQL} from "drizzle-orm";
import {db} from "@/db/client";
import {AuthorizationError} from "@/domain/command-context";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {requireReportingPlatformAdministrator} from "@/modules/identity/reporting-platform-authority.server";
import {requireCanonicalLabProvider} from "@/modules/operations/canonical-capability-lab-access.server";
import {loadAuthorizedSiteReportingScope} from "@/modules/insights/site-reporting-source-scope.server";
import {readScopedSiteGeography} from "./site-geography-read.server";
import {privateGeography,assignablePersonalArea,requireEntityGeographyConsent,type GeographyEntity} from "@/domain/entity-geography";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const columns={organization:"organization_id",person:"person_id",program:"program_id",offering:"offering_id",campaign:"campaign_id",
 partner:"partner_organization_id",funding_opportunity:"funding_opportunity_id",learning_activity:"noncredit_activity_id"} as const;
async function rows<T>(tx:Tx,query:SQL){return (await tx.execute(query)).rows as unknown as T[];}
/** Personal geography is self-only, never inherited by a guardian, employer,
 * denomination, Site, geographic filter, or delegated platform role. */
async function requireAuthority(request:Request,entity:GeographyEntity,tx:Tx,write:boolean){
 if(privateGeography(entity)){
  const actor=await getCommandContext(request);
  if(!actor.actorPersonId||actor.delegationMode||actor.sessionAccountId)throw new AuthorizationError("Direct Person geography consent");
  if(entity.entityKind==="person"){
   if(actor.actorPersonId!==entity.entityId)throw new AuthorizationError("Own Person geography only");
  }else{
   const own=await rows<{id:string}>(tx,sql`SELECT e.id FROM public.noncredit_participation_events e
    JOIN public.noncredit_registrations r ON r.id=e.registration_id WHERE e.id=${entity.entityId} AND r.participant_person_id=${actor.actorPersonId}`);
   if(!own.length)throw new AuthorizationError("Own learning participation geography only");
  }
  return actor.actorPersonId;
 }
 if(entity.entityKind==="learning_activity"){
  const provider=await requireCanonicalLabProvider("noncredit.enrollment.read");
  if(!provider.actor.actorPersonId||(write&&provider.actor.delegationMode))throw new AuthorizationError("Verified activity delivery geography");
  const siteIds=sql.join(provider.siteIds.map(id=>sql`${id}::uuid`),sql`,`);
  const owned=await rows<{id:string}>(tx,sql`SELECT e.id FROM public.noncredit_participation_events e
    JOIN public.noncredit_registrations r ON r.id=e.registration_id
    JOIN public.noncredit_self_enrollment_claims c ON c.registration_id=r.id AND c.participant_person_id=r.participant_person_id
    JOIN public.noncredit_self_enrollment_releases l ON l.id=c.release_id AND l.site_id=c.site_id
      AND l.registering_organization_id=r.registering_organization_id
      AND l.training_version_id=r.training_version_id AND l.offering_version_id=r.offering_version_id
      AND l.deployment_id=r.deployment_id AND l.adoption_id=r.adoption_id
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=r.registering_organization_id
    WHERE e.id=${entity.entityId} AND r.registering_organization_id=${provider.organizationId} AND c.site_id IN (${siteIds})`);
  if(owned.length!==1)throw new AuthorizationError("Authorized activity delivery evidence");
  return provider.actor.actorPersonId;
 }
 // Non-personal declared strategy is initially centrally governed; no
 // generic tenant write privilege is implied by an entity/area reference.
 return (await requireReportingPlatformAdministrator(request)).actorPersonId!;
}
export async function listEntityGeography(request:Request,entity:GeographyEntity){
 return db.transaction(async tx=>{
  if(entity.entityKind==="site"){
   const actor=await getCommandContext(request);
   const scope=await loadAuthorizedSiteReportingScope(tx,actor,entity.entityId);
   const geography=await readScopedSiteGeography(tx,scope);
   return geography.areas.map(area=>({areaCode:area.code,areaName:area.name,areaKind:area.kind,source:"derived_site_address",validFrom:geography.version?.resolved_at?new Date(geography.version.resolved_at).toISOString():null}));
  }
  await requireAuthority(request,entity,tx,false);
  return rows<{areaCode:string;areaName:string;areaKind:string;source:string;validFrom:string|null}>(tx,sql`
   SELECT a.code AS "areaCode",g.area_name AS "areaName",g.area_kind AS "areaKind",g.source,to_char(g.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "validFrom"
   FROM public.entity_geographic_assignments g JOIN public.geographic_areas a ON a.id=g.area_id
   WHERE g.entity_kind=${entity.entityKind} AND g.entity_id=${entity.entityId} AND g.role_code=${entity.role} AND g.valid_through IS NULL ORDER BY a.code`);
 },{isolationLevel:"repeatable read",accessMode:"read only"});
}
export async function changeEntityGeography(request:Request,entity:GeographyEntity,areaCode:string,operation:"assign"|"withdraw",consent?:boolean){
 if(entity.entityKind==="site")throw new Error("Site geography is derived, not assigned");
 if(operation==="assign")requireEntityGeographyConsent(entity,consent);
 return db.transaction(async tx=>{
  const actor=await requireAuthority(request,entity,tx,true);
  const privateArea=privateGeography(entity);
  // Serialize concurrent assign / withdraw for this exact entity and role.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${entity.entityKind+":"+entity.entityId+":"+entity.role},0))`);
  const [area]=await rows<{id:string;name:string;kind:string;source:string|null;vintage:string|null}>(tx,sql`
   SELECT a.id,coalesce(v.name,a.name) AS name,coalesce(v.kind,a.level_code) AS kind,v.source,v.vintage
   FROM public.geographic_areas a LEFT JOIN LATERAL (SELECT name,kind,source,vintage FROM public.geographic_area_versions
    WHERE area_id=a.id ORDER BY created_at DESC,id DESC LIMIT 1) v ON true WHERE a.code=${areaCode}`);
  if(!area)throw new Error("Unknown canonical geographic area");
  if(operation==="withdraw"){
   // Withdraw optional private location entirely, not just from current views.
   if(privateArea)await tx.execute(sql`DELETE FROM public.entity_geographic_assignments WHERE entity_kind=${entity.entityKind} AND entity_id=${entity.entityId} AND role_code=${entity.role} AND area_id=${area.id}`);
   else await tx.execute(sql`UPDATE public.entity_geographic_assignments SET valid_through=clock_timestamp() WHERE entity_kind=${entity.entityKind} AND entity_id=${entity.entityId} AND role_code=${entity.role} AND area_id=${area.id} AND valid_through IS NULL`);
   return {status:"withdrawn" as const};
  }
  if(privateArea&&!assignablePersonalArea(area.kind))throw new AuthorizationError("Coarse personal geography only");
  const column=sql.identifier(columns[entity.entityKind as keyof typeof columns]);
  await tx.execute(sql`INSERT INTO public.entity_geographic_assignments(entity_kind,${column},role_code,area_id,area_name,area_kind,area_source,area_vintage,source,assigned_by_person_id,consent_at)
   VALUES(${entity.entityKind},${entity.entityId},${entity.role},${area.id},${area.name},${area.kind},${area.source},${area.vintage},${privateArea?"self_declared":"governed_declaration"},${actor},${privateArea?new Date():null})
   ON CONFLICT(entity_kind,entity_id,role_code,area_id) WHERE valid_through IS NULL DO NOTHING`);
  return {status:"assigned" as const};
 });
}
