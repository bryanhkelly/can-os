import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  blueprints, blueprintVersions, blueprintComponents, catalogSites, siteOrganizationRoles,
} from "@/db/canonical-v301";
import { isCanonicalSiteDiscoverable, isPrivateCanSitePlanningAllowed } from "@/domain/canonical-site-availability";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { selectBlueprintWorkspaceRecipes } from "@/domain/blueprint-configuration";
import { publicSolutionComponentDescription } from "@/domain/public-solution-component";
import { assertVerifiedCanPlanningSite, isVerifiedCanSitePlanning } from "./verified-site-planning.server";

/**
 * Published-only discovery for readers without configuration rights.
 * It never loads Site draft configurations, reviews, operations, approval
 * decisions, or private CAN-authored Blueprint specs. It requires a current
 * exact Site/Organization operator relationship rather than a writer role.
 */
export async function getPublishedSolutionWorkspaceReadOnly(
  context:CommandContext, siteId:string,
){
  if(!context.actorPersonId)throw new AuthorizationError("authenticated session");
  assertCapability(context,"blueprint.read");
  if(!context.scope.siteIds?.includes(siteId))
    throw new AuthorizationError("published Solution Site scope");
  if(context.scope.organizationIds?.length!==1)
    throw new AuthorizationError("one published Solution Organization scope");
  const organizationId=context.scope.organizationIds[0]!;
  return db.transaction(async tx=>{
    const isCanPlanning=isVerifiedCanSitePlanning(context);
    const [site]=await tx.select({id:catalogSites.id,status:catalogSites.status})
      .from(catalogSites).where(eq(catalogSites.id,siteId)).limit(1);
    if(!site||(isCanPlanning
      ? !isPrivateCanSitePlanningAllowed(site.status)
      : !isCanonicalSiteDiscoverable(site.status)))
      throw new DomainError("UNAVAILABLE","The selected Site is unavailable.");
    if(isCanPlanning){
      await assertVerifiedCanPlanningSite(tx,context,siteId,organizationId);
    }else{
      const now=new Date();
      const [operator]=await tx.select({organizationId:siteOrganizationRoles.organizationId})
        .from(siteOrganizationRoles).where(and(
          eq(siteOrganizationRoles.siteId,siteId),
          eq(siteOrganizationRoles.organizationId,organizationId),
          eq(siteOrganizationRoles.roleCode,"operator"),
          lte(siteOrganizationRoles.validFrom,now),
          or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
        )).limit(1);
      if(!operator)throw new AuthorizationError("current published Solution Site operator");
    }
    const published=await tx.select({
      blueprintId:blueprints.id,title:blueprints.title,
      blueprintVersionId:blueprintVersions.id,versionNo:blueprintVersions.versionNo,
      spec:blueprintVersions.spec,
    }).from(blueprints)
      .innerJoin(blueprintVersions,eq(blueprintVersions.blueprintId,blueprints.id))
      .where(and(eq(blueprints.status,"active"),eq(blueprintVersions.lifecycle,"published")))
      .orderBy(asc(blueprints.title),desc(blueprintVersions.versionNo));
    const selected=selectBlueprintWorkspaceRecipes(published,new Set<string>());
    const components=selected.length
      ? await tx.select({
          id:blueprintComponents.id,
          blueprintVersionId:blueprintComponents.blueprintVersionId,
          key:blueprintComponents.componentKey,
          kind:blueprintComponents.componentKind,
          requirementMode:blueprintComponents.requirementMode,
          componentSpec:blueprintComponents.componentSpec,
        }).from(blueprintComponents)
          .where(inArray(blueprintComponents.blueprintVersionId,
            selected.map(item=>item.blueprintVersionId)))
          .orderBy(asc(blueprintComponents.componentKey))
      : [];
    return {
      siteId,organizationId,
      canConfigure:false,canReview:false,canExecute:false,
      affiliations:[],operations:[],configurations:[],
      templates:selected.map(({spec,...item})=>{
        const metadata=spec&&typeof spec==="object"&&!Array.isArray(spec)
          ? spec as Record<string,unknown> : {};
        return {
          ...item,
          programCode:typeof metadata.programCode==="string"?metadata.programCode:null,
          offeringCode:typeof metadata.offeringCode==="string"?metadata.offeringCode:null,
          linkedPublishedOffering:null,
          components:components.filter(c=>c.blueprintVersionId===item.blueprintVersionId)
            .map(({id,key,kind,requirementMode,componentSpec})=>({
              id,key,kind,requirementMode,
              ...publicSolutionComponentDescription(componentSpec),
            })),
        };
      }),
    };
  });
}
