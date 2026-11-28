import {listLaunchOptionsService,getLaunchEntryService,launchEntryInput} from "./launch-discovery.server";
import {resolveLaunchRegistrar,startLaunchInput,startLaunchService,completeLaunchRequirementInput,completeLaunchRequirementService,submitLaunchEvidenceInput,submitLaunchEvidenceService,reviewLaunchEvidenceInput,reviewLaunchEvidenceService,activateLaunchInput,activateLaunchService,scheduleLaunchOrientationInput,scheduleLaunchOrientationService} from "./launch-commands.server";
import {createLaunchSiteInput,createLaunchSiteService} from "./launch-site-create.server";
import { schoolPlanningLocationSchema } from "@/domain/school-stub";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { readSitePhysicalAddress } from "@/domain/site-setup-configuration";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { listOpeningOperators } from "./opening-handoff.server";

import { launchOpeningDate } from "@/domain/launch-opening-date";
import { launchEntrySelection } from "@/domain/launch-entry";

/** Convert database JSONB's unknown-value index signatures to genuine
 * serializable values before crossing a TanStack server-function boundary. */
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

const uuid = z.string().uuid();

/** Physical location is submitted by the church. It is not jurisdiction verification. */

function registrarContext(capability:string){return resolveLaunchRegistrar(getRequest(),capability);}

/** Wizard dropdown options, scoped to the registrar's verified organization grant. */
export const listLaunchOptions=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");return listLaunchOptionsService(getRequest());});

/** Start a GF3 host/program launch: creates the Program and instantiates its Launch Journey. */
export const startLaunch=createServerFn({method:"POST"})
 .validator((raw:unknown)=>startLaunchInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return startLaunchService(getRequest(),data);
 });

/** Programs in pre-active states with their Launch Journey and requirement checklist. */
export const listLaunches = createServerFn({ method: "GET" })
 .validator((value:unknown)=>z.object({
   includeActive:z.boolean().optional(),
   siteId:z.string().uuid().optional(),
 }).strict().optional().parse(value))
 .handler(
  async ({data}) => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) return { launches: [] };
    const [{ db }, s, { and, asc, eq, inArray, or }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const canReviewerOrganizations = context.grantSiteId === null && !context.scope.siteIds?.length && context.capabilities.has("program.activate")
      ? await db.select({ id: s.organizations.id }).from(s.organizations)
          .where(and(inArray(s.organizations.id, organizationIds), eq(s.organizations.type, "can_network")))
      : [];
    const programRows = await db
      .select({
        id: s.programs.id,
        name: s.programs.name,
        slug: s.programs.slug,
        type: s.programs.type,
        gradeRange: s.programs.gradeRange,
        status: s.programs.status,
        organizationId: s.programs.organizationId,
        academicProviderOrganizationId: s.programs.academicProviderOrganizationId,
        siteId: s.programs.siteId,
        siteTimezone: s.sites.timezone,
        metadata: s.programs.metadata,
        publicSiteSlug: s.sitePublications.slug,
        publicSiteStatus: s.sitePublications.status,
        createdAt: s.programs.createdAt,
      })
      .from(s.programs)
      .leftJoin(s.sites, eq(s.sites.id, s.programs.siteId))
      .leftJoin(s.sitePublications, eq(s.sitePublications.siteId, s.programs.siteId))
      .where(
        and(
          or(inArray(s.programs.organizationId, organizationIds),
            ...(canReviewerOrganizations.length ? [inArray(s.programs.academicProviderOrganizationId, canReviewerOrganizations.map(org => org.id))] : [])),
          inArray(s.programs.status, data?.includeActive ? ["draft", "launching", "ready", "active"] : ["draft", "launching", "ready"]),
          ...(context.grantSiteId === null ? [] : [eq(s.programs.siteId, context.grantSiteId)]),
          ...(data?.siteId ? [eq(s.programs.siteId, data.siteId)] : []),
          ...(context.scope.programIds?.length
            ? [inArray(s.programs.id, context.scope.programIds)] : []),
          ...(context.scope.siteIds?.length
            ? [inArray(s.programs.siteId, context.scope.siteIds)] : []),
        ),
      )
      .orderBy(asc(s.programs.createdAt));
    const launches = await Promise.all(
      programRows.map(async (program) => {
        const [journey] = await db
          .select({ id: s.journeys.id, status: s.journeys.status })
          .from(s.journeys)
          .where(
            and(
              eq(s.journeys.participantType, "program"),
              eq(s.journeys.participantId, program.id),
            ),
          )
          .limit(1);
        const requirements = journey
          ? await db
              .select({
                id: s.journeyRequirements.id,
                key: s.journeyRequirements.key,
                title: s.journeyRequirements.title,
                status: s.journeyRequirements.status,
                blocking: s.journeyRequirements.blocking,
                ownerPersonId: s.journeyRequirements.ownerPersonId,
                evidence: s.journeyRequirements.evidence,
                metadata: s.journeyRequirements.metadata,
              })
              .from(s.journeyRequirements)
              .where(eq(s.journeyRequirements.journeyId, journey.id))
              .orderBy(asc(s.journeyRequirements.createdAt))
          : [];
        const { metadata, ...record } = program;
        const targetOpeningDate = launchOpeningDate(metadata);
        return {
          ...record,
          ...(targetOpeningDate ? { targetOpeningDate } : {}),
          createdAt: program.createdAt.toISOString(),
          // Re-read canonical Site publication state on every launch reload.
          publicSite: program.publicSiteSlug && isPublicSiteSlug(program.publicSiteSlug)
            ? { host: publicSiteHost(program.publicSiteSlug),
                status: program.publicSiteStatus === "published" ? "published" as const : "draft" as const }
            : null,
          journey: journey ?? null,
          requirements:requirements.map(requirement=>({
            ...requirement,
            evidence:requirement.evidence.map(safeJsonObject),
            metadata:safeJsonObject(requirement.metadata),
          })),
          canReviewEvidence: canReviewerOrganizations.some(org => org.id === program.academicProviderOrganizationId),
          openingOperators:await listOpeningOperators(program),
        };
      }),
    );
    return { launches };
  },
);

/**
 * Record a school-owned launch requirement. The shared command rechecks the
 * locked requirement's current owner so a registrar cannot complete CAN or
 * third-party work through this launch endpoint.
 */
export const completeLaunchRequirement=createServerFn({method:"POST"})
 .validator((raw:unknown)=>completeLaunchRequirementInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return completeLaunchRequirementService(getRequest(),data);
 });

/**
 * Submit a written evidence statement against a canonical program Launch Journey.
 * Submission does not complete or approve the requirement.
 */
export const submitLaunchEvidence=createServerFn({method:"POST"})
 .validator((raw:unknown)=>submitLaunchEvidenceInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return submitLaunchEvidenceService(getRequest(),data);
 });

/**
 * CAN institutional decision on a submitted program-opening evidence statement.
 * Site-level registrar grants cannot approve their own launch evidence.
 */
export const reviewLaunchEvidence=createServerFn({method:"POST"})
 .validator((raw:unknown)=>reviewLaunchEvidenceInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return reviewLaunchEvidenceService(getRequest(),data);
 });

/** Activate a launched program; program-launch-service enforces the Launch Journey ready invariant. */
export const activateLaunch=createServerFn({method:"POST"})
 .validator((raw:unknown)=>activateLaunchInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return activateLaunchService(getRequest(),data);
 });

/** Create a host site inside an organization-wide registrar grant. */
export const createLaunchSite=createServerFn({method:"POST"})
 .validator((raw:unknown)=>createLaunchSiteInput.parse(raw))
 .handler(async({data})=>createLaunchSiteService(await registrarContext("program.launch.start"),data));
/** Create a unique orientation event and expose it to site/program calendars. */
export const scheduleLaunchOrientation=createServerFn({method:"POST"})
 .validator((raw:unknown)=>scheduleLaunchOrientationInput.parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");return scheduleLaunchOrientationService(getRequest(),data);
 });

/** Read-only landing decision. Uses the same verified registrar/capability
 * boundary as starting a launch; it never creates or completes records. */
export const getLaunchEntry=createServerFn({method:"GET"}).validator((raw:unknown)=>launchEntryInput.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return getLaunchEntryService(getRequest(),data);});
