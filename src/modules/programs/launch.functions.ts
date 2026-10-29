import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { programTypes } from "@/domain/program-offerings";
import { isPublicSiteSlug, publicSiteHost } from "@/domain/public-site-address";
import { activateProgram,createProgramOrientation,startProgramLaunch } from "./program-launch-service";
import { listOpeningOperators } from "./opening-handoff.server";

const uuid = z.string().uuid();

const startLaunchInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  type: z.enum(programTypes),
  gradeRange: z.object({
    min: z.string().trim().min(1).max(10),
    max: z.string().trim().min(1).max(10),
  }),
  deliveryModel: z
    .object({
      onsite: z.boolean().optional(),
      asynchronous: z.boolean().optional(),
      liveOnline: z.boolean().optional(),
      onsiteDaysPerWeek: z.number().int().min(1).max(7).optional(),
    })
    .refine(
      (model) => !!(model.onsite || model.asynchronous || model.liveOnline),
      "Select at least one delivery model",
    ),
  hostOrganizationId: uuid,
  jurisdictionId: uuid,
  academicProviderOrganizationId: uuid,
  creditIssuingOrganizationId: uuid.optional(),
  creditMode: z.enum(["credit_bearing", "non_credit"]).optional(),
  siteId: uuid.optional(),
});

async function registrarContext(capability: string) {
  const context = await getCommandContext(getRequest());
  assertCapability(context, capability);
  if (context.role !== "registrar") {
    throw new AuthorizationError("registrar program launch workspace");
  }
  return context;
}

/** Wizard dropdown options, scoped to the registrar's verified organization grant. */
export const listLaunchOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) {
      return { organizations: [], academicProviderOrganizations: [], creditIssuingOrganizations: [], sites: [], jurisdictions: [] };
    }
    const [{ db }, s, { and, asc, eq, inArray }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const [organizationRows, siteRows, jurisdictionRows, canProviderRows] = await Promise.all([
      db
        .select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type })
        .from(s.organizations)
        .where(inArray(s.organizations.id, organizationIds))
        .orderBy(asc(s.organizations.name)),
      db
        .select({
          id: s.sites.id,
          organizationId: s.sites.organizationId,
          name: s.sites.name,
          slug: s.sites.slug,
          timezone: s.sites.timezone,
        })
        .from(s.sites)
        .where(and(inArray(s.sites.organizationId, organizationIds),
          ...(context.grantSiteId === null ? [] : [eq(s.sites.id, context.grantSiteId)])))
        .orderBy(asc(s.sites.name)),
      db
        .select({ id: s.jurisdictions.id, code: s.jurisdictions.code, name: s.jurisdictions.name })
        .from(s.jurisdictions)
        .orderBy(asc(s.jurisdictions.name)),
      // CAN provider choices are distinct from the host's organization grants.
      // This is public organization identity, not a grant or verified service agreement.
      db.select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type })
        .from(s.organizations).where(eq(s.organizations.type, "can_network"))
        .orderBy(asc(s.organizations.name)),
    ]);
    const knownIds = new Set(organizationRows.map(organization => organization.id));
    const academicProviderOrganizations = [
      ...organizationRows,
      ...canProviderRows.filter(provider => !knownIds.has(provider.id)),
    ];
    return {
      organizations: organizationRows, // The host selector remains scoped to the local registrar.
      academicProviderOrganizations,
      creditIssuingOrganizations: academicProviderOrganizations,
      sites: siteRows,
      jurisdictions: jurisdictionRows,
    };
  },
);

/** Start a GF3 host/program launch: creates the Program and instantiates its Launch Journey. */
export const startLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => startLaunchInput.parse(data))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.launch.start");
    if (!context.scope.organizationIds?.includes(data.hostOrganizationId)) {
      throw new AuthorizationError("host organization scope");
    }
    const organizationWide = context.grantSiteId === null;
    if (!organizationWide && !data.siteId) {
      throw new AuthorizationError("site-scoped launch requires a site");
    }
    if (data.siteId && !organizationWide && !context.scope.siteIds?.includes(data.siteId)) {
      throw new AuthorizationError("site scope");
    }
    // Organization-wide grants have no site filter. The domain service checks
    // that the target site belongs to the selected host organization.
    const permittedContext = organizationWide
      ? { ...context, scope: { ...context.scope, siteIds: undefined } }
      : context;
    return startProgramLaunch(permittedContext, data);
  });

/** Programs in pre-active states with their Launch Journey and requirement checklist. */
export const listLaunches = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) return { launches: [] };
    const [{ db }, s, { and, asc, eq, inArray }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const programRows = await db
      .select({
        id: s.programs.id,
        name: s.programs.name,
        slug: s.programs.slug,
        type: s.programs.type,
        status: s.programs.status,
        organizationId: s.programs.organizationId,
        siteId: s.programs.siteId,
        siteTimezone: s.sites.timezone,
        publicSiteSlug: s.sitePublications.slug,
        publicSiteStatus: s.sitePublications.status,
        createdAt: s.programs.createdAt,
      })
      .from(s.programs)
      .leftJoin(s.sites, eq(s.sites.id, s.programs.siteId))
      .leftJoin(s.sitePublications, eq(s.sitePublications.siteId, s.programs.siteId))
      .where(
        and(
          inArray(s.programs.organizationId, organizationIds),
          inArray(s.programs.status, ["draft", "launching", "ready"]),
          inArray(s.programs.id,context.scope.programIds??[]),
          ...(context.scope.siteIds?.length?[inArray(s.programs.siteId,context.scope.siteIds)]:[]),
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
              })
              .from(s.journeyRequirements)
              .where(eq(s.journeyRequirements.journeyId, journey.id))
              .orderBy(asc(s.journeyRequirements.createdAt))
          : [];
        return {
          ...program,
          createdAt: program.createdAt.toISOString(),
          // Re-read canonical Site publication state on every launch reload.
          publicSite: program.publicSiteSlug && isPublicSiteSlug(program.publicSiteSlug)
            ? { host: publicSiteHost(program.publicSiteSlug),
                status: program.publicSiteStatus === "published" ? "published" as const : "draft" as const }
            : null,
          journey: journey ?? null,
          requirements,
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
export const completeLaunchRequirement = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ journeyRequirementId: uuid, confirmed: z.literal(true) }).strict().parse(data),
  )
  .handler(async ({ data }) => {
    const context = await registrarContext("journey.requirement.complete");
    const journeyStatus = await completeJourneyRequirement(
      context,
      data.journeyRequirementId,
      [{ fact: "school_owned_requirement_confirmed" }],
      { allowedCurrentStatuses: ["needs_you"] },
    );
    return { journeyRequirementId: data.journeyRequirementId, journeyStatus };
  });

/** Activate a launched program; program-launch-service enforces the Launch Journey ready invariant. */
export const activateLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ programId: uuid,recipientPersonId:uuid.optional() }).strict().parse(data))
  .handler(async ({ data }) => {
    const context = await registrarContext("program.activate");
    await activateProgram(context, data.programId,data.recipientPersonId?{recipientPersonId:data.recipientPersonId}:undefined);
    return { programId: data.programId, status: "active" as const };
  });

/** Create a host site inside an organization-wide registrar grant. */
export const createLaunchSite = createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({
  organizationId:uuid,name:z.string().trim().min(2).max(160),
  slug:z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone:z.string().trim().min(3).max(80),
 }).parse(v))
 .handler(async({data})=>{
  const actor=await registrarContext("program.launch.start");
  if(!actor.actorPersonId||!actor.scope.organizationIds?.includes(data.organizationId)||actor.grantSiteId!==null)
   throw new AuthorizationError("organization-wide site creation");
  const [{db},s,{provisionNewSitePublicationDraft},{and,eq,or,sql}]=await Promise.all([
   import("@/db/client"),import("@/db/schema"),
   import("@/modules/sites/site-public-provisioning.server"),
   import("drizzle-orm"),
  ]);
  return db.transaction(async tx=>{
   // D1: recognize the church's existing Site instead of creating a duplicate.
   // The unique index only covers slug; a renamed slug would otherwise fork the campus.
   const [existing]=await tx.select({id:s.sites.id,name:s.sites.name,slug:s.sites.slug})
    .from(s.sites)
    .where(and(eq(s.sites.organizationId,data.organizationId),or(
     eq(s.sites.slug,data.slug),
     sql`lower(${s.sites.name}) = ${data.name.trim().toLowerCase()}`,
    )))
    .limit(1);
   if(existing)throw new Error(
    `This church already has the site "${existing.name}" (${existing.slug}). Select it from the Site list instead of creating a duplicate.`);
   const [site]=await tx.insert(s.sites).values({...data}).returning({id:s.sites.id});
   if(!site)throw new Error("Failed to create Site");
   await emitEvent(tx,{
    eventType:EventTypes.SiteCreated,aggregateType:"site",aggregateId:site.id,
    actorPersonId:actor.actorPersonId,organizationId:data.organizationId,
    siteId:site.id,payload:{name:data.name,timezone:data.timezone},
   });
   await writeAudit(tx,actor,{
    action:"site.create",entityType:"site",entityId:site.id,
    scope:{organizationId:data.organizationId,siteId:site.id},
    after:{name:data.name,timezone:data.timezone}});
   // PUB-12: create the draft within the same transaction, AFTER the Site
   // creation evidence. Nothing is public, and no publishing grant is issued.
   const publicSiteDraft=await provisionNewSitePublicationDraft(tx,actor,{
    id:site.id,organizationId:data.organizationId,slug:data.slug,
   });
   return {siteId:site.id,publicSiteDraft};
  });
 });
/** Create a unique orientation event and expose it to site/program calendars. */
export const scheduleLaunchOrientation=createServerFn({method:"POST"})
 .validator((v:unknown)=>z.object({programId:uuid,
  title:z.string().trim().min(2).max(160),startsAt:z.string().datetime({offset:true}),
  endsAt:z.string().datetime({offset:true}),timezone:z.string().min(3)}).parse(v))
 .handler(async({data})=>{
  const actor=await registrarContext("calendar.event.create");
  if(!actor.scope.programIds?.includes(data.programId))throw new AuthorizationError("orientation program");
  const start=new Date(data.startsAt),end=new Date(data.endsAt);
  if(end<=start)throw new Error("Orientation end must follow start");
  const [{db},s,{eq}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  const [program]=await db.select({siteId:s.programs.siteId})
   .from(s.programs).where(eq(s.programs.id,data.programId)).limit(1);
  const [site]=program?.siteId?await db.select({timezone:s.sites.timezone}).from(s.sites)
   .where(eq(s.sites.id,program.siteId)).limit(1):[];
  const eventId=await createProgramOrientation(actor,{programId:data.programId,title:data.title,
   startsAt:start,endsAt:end,timezone:site?.timezone??data.timezone});
  return {eventId};
 });
