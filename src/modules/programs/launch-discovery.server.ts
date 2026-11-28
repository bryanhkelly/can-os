import {z} from "zod";
import {parseCommandInput} from "@/domain/command-input";
import {resolveLaunchRegistrar} from "./launch-commands.server";
import {schoolPlanningLocationSchema} from "@/domain/school-stub";
import {readSitePhysicalAddress} from "@/domain/site-setup-configuration";
import {isPublicSiteSlug,publicSiteHost} from "@/domain/public-site-address";
import {launchEntrySelection} from "@/domain/launch-entry";
type SafeJson = string | number | boolean | null | SafeJson[] | {[key:string]:SafeJson};
function safeJson(value:unknown):SafeJson {
  if(value===null||typeof value==="string"||typeof value==="boolean")return value;
  if(typeof value==="number")return Number.isFinite(value)?value:null;
  if(Array.isArray(value))return value.map(safeJson);
  if(typeof value==="object")return Object.fromEntries(
    Object.entries(value).map(([key,entry])=>[key,safeJson(entry)]));
  return null;
}
function safeJsonObject(value:Record<string,unknown>):Record<string,SafeJson>{
  return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,safeJson(entry)]));
}


export async function listLaunchOptionsService(request:Request){    const context = await resolveLaunchRegistrar(request,"program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) {
      return { organizations: [], academicProviderOrganizations: [], creditIssuingOrganizations: [], sites: [], jurisdictions: [],
        canCreateSite: context.grantSiteId === null && context.capabilities.has("program.launch.start"),
        schoolSetupAdministrator: context.role === "site_admin" };
    }
    const [{ db }, s, { and, asc, eq, inArray, or }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const [organizationRows, siteRows, jurisdictionRows, canProviderRows] = await Promise.all([
      db
        .select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type, slug: s.organizations.slug })
        .from(s.organizations)
        .where(inArray(s.organizations.id, organizationIds))
        .orderBy(asc(s.organizations.name)),
      db
        .select({
          id: s.sites.id,
          organizationId: s.sites.organizationId,
          lifecycleStatus: s.sites.lifecycleStatus,
          name: s.sites.name,
          slug: s.sites.slug,
          timezone: s.sites.timezone,
          address: s.sites.address,
          metadata: s.sites.metadata,
          updatedAt: s.sites.updatedAt,
          websiteSlug:s.sitePublications.slug,
          websiteStatus:s.sitePublications.status,
        })
        .from(s.sites)
        .leftJoin(s.sitePublications,eq(s.sitePublications.siteId,s.sites.id))
        .where(and(inArray(s.sites.organizationId, organizationIds),
          ...(context.grantSiteId === null ? [] : [eq(s.sites.id, context.grantSiteId)])))
        .orderBy(asc(s.sites.name)),
      db
        .select({ id: s.jurisdictions.id, code: s.jurisdictions.code, name: s.jurisdictions.name })
        .from(s.jurisdictions)
        .orderBy(asc(s.jurisdictions.name)),
      // CAN provider choices are distinct from the host's organization grants.
      // This is public organization identity, not a grant or verified service agreement.
      db.select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type, slug: s.organizations.slug })
        .from(s.organizations).where(eq(s.organizations.type, "can_network"))
        .orderBy(asc(s.organizations.name)),
    ]);
    // One scoped lookup establishes whether the Site has a real saved copy
    // revision. A reserved public address alone is not Website & Brand completion.
    const contentRows = siteRows.length
      ? await db.selectDistinct({siteId:s.siteLocalContentVersions.siteId})
        .from(s.siteLocalContentVersions)
        .where(inArray(s.siteLocalContentVersions.siteId,siteRows.map(site=>site.id)))
      : [];
    const sitesWithContent = new Set(contentRows.map(row=>row.siteId));
    const knownIds = new Set(organizationRows.map(organization => organization.id));
    const academicProviderOrganizations = [
      ...organizationRows,
      ...canProviderRows.filter(provider => !knownIds.has(provider.id)),
    ];
    return {
      organizations: organizationRows, // The host selector remains scoped to the local registrar.
      academicProviderOrganizations,
      creditIssuingOrganizations: academicProviderOrganizations,
      sites: siteRows.map(({metadata,websiteSlug,websiteStatus,...site}) => {
        const planningLocation=schoolPlanningLocationSchema.safeParse(metadata.schoolPlanningLocation);
        return { ...site, planningLocation:planningLocation.success?planningLocation.data:null, ...site, updatedAt:site.updatedAt.toISOString(), address: site.address === null ? null : safeJsonObject(site.address), addressStatus:readSitePhysicalAddress(site.address).status, sitePhysicalAddressRevision:typeof metadata.sitePhysicalAddressRevision==="string"?metadata.sitePhysicalAddressRevision:null, siteIdentityRevision:typeof metadata.siteIdentityRevision==="string"?metadata.siteIdentityRevision:null, contactDraft:safeJson(metadata.setupContact??null), siteInformationDraft:safeJson(metadata.siteInformation??null),
          websiteContentSaved:sitesWithContent.has(site.id),websiteDraft:websiteSlug&&isPublicSiteSlug(websiteSlug)&&(websiteStatus==="draft"||websiteStatus==="published")?{host:publicSiteHost(websiteSlug),status:websiteStatus}:null }; }),
      jurisdictions: jurisdictionRows,
      canCreateSite: context.grantSiteId === null && context.capabilities.has("program.launch.start"),
        schoolSetupAdministrator: context.role === "site_admin",
    };
  
}
export const launchEntryInput=z.object({siteId:z.string().uuid().optional(),programId:z.string().uuid().optional()}).strict();
export async function getLaunchEntryService(request:Request,raw:unknown){
 const data=parseCommandInput(launchEntryInput,raw);

    const context = await resolveLaunchRegistrar(request,"program.launch.start");
    const options = await listLaunchOptionsService(request);
    if (!options.organizations.length) return null;
    const [{ db }, s, { and, eq, inArray }] = await Promise.all([
      import("@/db/client"), import("@/db/schema"), import("drizzle-orm"),
    ]);
    // Organization-wide registrars can legitimately have no enumerated Program IDs.
    // Discover existing Programs through the verified organization/Site grant, not
    // through an optional list that would falsely signal a first-time launch.
    const records = await db.select({
      id: s.programs.id, siteId: s.programs.siteId, status: s.programs.status,
    }).from(s.programs).where(and(
      inArray(s.programs.organizationId, options.organizations.map(org => org.id)),
      ...(context.grantSiteId === null ? [] : [eq(s.programs.siteId, context.grantSiteId)]),
      ...(context.grantSiteId !== null && context.scope.programIds?.length
        ? [inArray(s.programs.id, context.scope.programIds)] : []),
      ...(context.scope.siteIds?.length
        ? [inArray(s.programs.siteId, context.scope.siteIds)] : []),
    ));
    return launchEntrySelection({ programs: records, sites: options.sites, selection: data });
}
