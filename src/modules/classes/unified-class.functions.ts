import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, canonicalClasses, canonicalClassOfferings,
  canonicalClassOfferingVersions, canonicalOfferingCourses, courseVersions, courses,
  deploymentOfferingAdoptions, offeringVersions, offerings, programDeployments,
  educationOperations, educationOperationOrganizationRoles, educationOperationSites,
  siteOrganizationRoles, catalogSites, classroomDeploymentSites,
} from "@/db/canonical-v301";
import { classDefinitionSchema, classOfferingTermsSchema } from "@/domain/unified-class";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

// These native commands are dormant until restricted RLS,
// dedicated role provision and test01 acceptance are approved.
function requireClassFeature() {
  if (process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED !== "true") {
    throw new AuthorizationError("unified Class release not activated");
  }
  setResponseHeader("Cache-Control", "private, no-store");
}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ClassOperator = { actor: CommandContext; organizationId: string; siteIds: string[] };

async function requireClassOperator(): Promise<ClassOperator> {
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId || !["site_admin", "registrar"].includes(actor.role ?? "")) {
    throw new AuthorizationError("authorized Class operator");
  }
  // Purpose-specific grant: unrelated program or Site membership alone
  // must not authorize Class creation.
  assertCapability(actor, "class.manage");
  const ids = actor.scope.organizationIds ?? [];
  if (ids.length !== 1) throw new AuthorizationError("one verified operating organization");
  return { actor, organizationId: ids[0]!, siteIds: actor.scope.siteIds ?? [] };
}

async function validateClassAuthority(tx: Tx, operator: ClassOperator, input: ReturnType<typeof classDefinitionSchema.parse>) {
  if (input.operatingOrganizationId !== operator.organizationId) {
    throw new AuthorizationError("current operating Organization");
  }
  if (input.siteId && !operator.siteIds.includes(input.siteId)) {
    throw new AuthorizationError("current Site operator scope");
  }
  if (!input.siteId && input.deliveryMode !== "self_paced") {
    throw new AuthorizationError("scheduled and facilitated Classes require an authorized Site");
  }
  const now = new Date();
  const [catalog] = await tx.select({
    courseVersionId: courseVersions.id,
    courseTitle: courses.title,
    operationId: programDeployments.operationId,
  }).from(programDeployments)
    .innerJoin(educationOperations, eq(educationOperations.id,programDeployments.operationId))
    .innerJoin(deploymentOfferingAdoptions, and(
      eq(deploymentOfferingAdoptions.id,input.adoptionId),
      eq(deploymentOfferingAdoptions.deploymentId,programDeployments.id),
      eq(deploymentOfferingAdoptions.offeringVersionId,input.offeringVersionId),
    ))
    .innerJoin(offeringVersions, and(
      eq(offeringVersions.id,input.offeringVersionId),
      eq(offeringVersions.offeringId,programDeployments.offeringId),
    ))
    .innerJoin(offerings, eq(offerings.id,offeringVersions.offeringId))
    .innerJoin(canonicalOfferingCourses,eq(canonicalOfferingCourses.offeringVersionId,offeringVersions.id))
    .innerJoin(courseVersions,eq(courseVersions.id,canonicalOfferingCourses.courseVersionId))
    .innerJoin(courses,eq(courses.id,courseVersions.courseId))
    .where(and(
      eq(programDeployments.id,input.deploymentId),
      eq(programDeployments.status,"active"),
      eq(educationOperations.status,"active"),
      eq(offerings.status,"active"),
      eq(offeringVersions.lifecycle,"published"),isNotNull(offeringVersions.publishedAt),
      eq(courseVersions.id,input.courseVersionId),
      eq(courseVersions.lifecycle,"published"),isNotNull(courseVersions.publishedAt),
      eq(deploymentOfferingAdoptions.approvalStatus,"approved"),
      lte(deploymentOfferingAdoptions.validFrom,now),
      or(isNull(deploymentOfferingAdoptions.validThrough),gt(deploymentOfferingAdoptions.validThrough,now)),
    )).limit(1);
  if (!catalog) throw new AuthorizationError("currently published Course under approved Deployment/adoption");

  const [operatorRole] = await tx.select({id:educationOperationOrganizationRoles.id})
    .from(educationOperationOrganizationRoles).where(and(
      eq(educationOperationOrganizationRoles.operationId,catalog.operationId),
      eq(educationOperationOrganizationRoles.organizationId,operator.organizationId),
      eq(educationOperationOrganizationRoles.roleCode,"operator"),
      eq(educationOperationOrganizationRoles.status,"approved"),
      lte(educationOperationOrganizationRoles.validFrom,now),
      or(isNull(educationOperationOrganizationRoles.validThrough),
        gt(educationOperationOrganizationRoles.validThrough,now)),
    )).limit(1);
  if (!operatorRole) throw new AuthorizationError("current authorized Operation operator");

  if (input.siteId) {
    const [site] = await tx.select({id:catalogSites.id}).from(catalogSites)
      .innerJoin(educationOperationSites,and(
        eq(educationOperationSites.siteId,catalogSites.id),
        eq(educationOperationSites.operationId,catalog.operationId),
        lte(educationOperationSites.validFrom,now),
        or(isNull(educationOperationSites.validThrough),gt(educationOperationSites.validThrough,now)),
      ))
      .innerJoin(siteOrganizationRoles,and(
        eq(siteOrganizationRoles.siteId,catalogSites.id),
        eq(siteOrganizationRoles.organizationId,operator.organizationId),
        inArray(siteOrganizationRoles.roleCode,["operator","host"]),
        lte(siteOrganizationRoles.validFrom,now),
        or(isNull(siteOrganizationRoles.validThrough),gt(siteOrganizationRoles.validThrough,now)),
      ))
      .where(and(eq(catalogSites.id,input.siteId),eq(catalogSites.status,"active")))
      .limit(1);
    if (!site) throw new AuthorizationError("currently authorized Class Site");
    if (["facilitated","hybrid","scheduled"].includes(input.deliveryMode)) {
      const [placement] = await tx.select({id:classroomDeploymentSites.id})
        .from(classroomDeploymentSites).where(and(
          eq(classroomDeploymentSites.deploymentId,input.deploymentId),
          eq(classroomDeploymentSites.siteId,input.siteId),
        )).limit(1);
      if (!placement) throw new AuthorizationError("current Deployment/Site placement");
    }
  }
  return catalog;
}

/** Atomic creation: a Class always receives its Class Offering identity and
 * private/draft enrollment terms. No self-enrollment or credit is issued here. */
export const createUnifiedClassDraft = createServerFn({method:"POST"})
  .validator((value:unknown) => {
    const {definition, terms} = value && typeof value === "object" ? value as Record<string,unknown> : {};
    return {definition:classDefinitionSchema.parse(definition),terms:classOfferingTermsSchema.parse(terms)};
  })
  .handler(async({data}) => {
    requireClassFeature();
    const operator = await requireClassOperator();
    return db.transaction(async tx => {
      await validateClassAuthority(tx,operator,data.definition);
      const [created] = await tx.insert(canonicalClasses).values({
        ...data.definition, state:"draft",
        createdByPersonId:operator.actor.actorPersonId!,
      }).returning({id:canonicalClasses.id});
      if (!created) throw new Error("Class creation did not return an identity");
      const [offering] = await tx.insert(canonicalClassOfferings)
        .values({classId:created.id}).returning({id:canonicalClassOfferings.id});
      if (!offering) throw new Error("Class Offering creation did not return an identity");
      const [version] = await tx.insert(canonicalClassOfferingVersions).values({
        classOfferingId:offering.id,classId:created.id,versionNo:1,
        visibility:data.terms.visibility,enrollmentMethods:data.terms.enrollmentMethods,
        opensAt:data.terms.opensAt?new Date(data.terms.opensAt):null,
        closesAt:data.terms.closesAt?new Date(data.terms.closesAt):null,
        capacity:data.terms.capacity,
        consentVersion:data.terms.consentVersion,consentText:data.terms.consentText,state:"draft",
        createdByPersonId:operator.actor.actorPersonId!,
      }).returning({id:canonicalClassOfferingVersions.id});
      if (!version) throw new Error("Class Offering terms could not be stored");
      await tx.insert(auditEvents).values({
        actorPersonId:operator.actor.actorPersonId!,
        owningOrganizationId:operator.organizationId,
        eventCode:"class.draft_created",entityKind:"class",entityId:created.id,
        payload:{courseVersionId:data.definition.courseVersionId,
          deploymentId:data.definition.deploymentId,siteId:data.definition.siteId,
          classOfferingVersionId:version.id},
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassDraftCreated",aggregateType:"class",aggregateId:created.id,
        actorPersonId:operator.actor.actorPersonId!,
        payload:{operatingOrganizationId:operator.organizationId,offeringVersionId:version.id},
      });
      return {classId:created.id,classOfferingId:offering.id,classOfferingVersionId:version.id,status:"draft" as const};
    });
  });

/** Private provider-scoped draft inspection. No public catalog exposure. */
export const getMyUnifiedClassDrafts = createServerFn({method:"GET"})
  .handler(async()=>{
    requireClassFeature();
    const operator=await requireClassOperator();
    return db.select({
      classId:canonicalClasses.id,title:canonicalClasses.title,
      courseVersionId:canonicalClasses.courseVersionId,
      deploymentId:canonicalClasses.deploymentId,siteId:canonicalClasses.siteId,
      deliveryMode:canonicalClasses.deliveryMode,state:canonicalClasses.state,
      classOfferingId:canonicalClassOfferings.id,
      visibility:canonicalClassOfferingVersions.visibility,
      enrollmentMethods:canonicalClassOfferingVersions.enrollmentMethods,
      offeringState:canonicalClassOfferingVersions.state,
    }).from(canonicalClasses)
      .innerJoin(canonicalClassOfferings,eq(canonicalClassOfferings.classId,canonicalClasses.id))
      .innerJoin(canonicalClassOfferingVersions,and(
        eq(canonicalClassOfferingVersions.classId,canonicalClasses.id),
        eq(canonicalClassOfferingVersions.classOfferingId,canonicalClassOfferings.id),
      ))
      .where(and(
        eq(canonicalClasses.operatingOrganizationId,operator.organizationId),
        or(isNull(canonicalClasses.siteId),
          operator.siteIds.length ? inArray(canonicalClasses.siteId,operator.siteIds) : undefined),
      )).orderBy(asc(canonicalClasses.createdAt)).limit(100);
  });


const manageOfferingInput = z.object({
  classId: z.string().uuid(),
  classOfferingVersionId: z.string().uuid(),
}).strict();

/** Publish exact, immutable Class Offering terms, independent of whether public.
 * Current publisher/deployment/Site authority is always checked again.
 */
export const publishUnifiedClassOffering = createServerFn({ method:"POST" })
  .validator((raw:unknown) => manageOfferingInput.parse(raw))
  .handler(async ({data}) => {
    requireClassFeature();
    const operator=await requireClassOperator();
    return db.transaction(async tx=>{
      const [instance]=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.id,data.classId),
          eq(canonicalClasses.operatingOrganizationId,operator.organizationId)))
        .for("update").limit(1);
      if(!instance || !["draft","approved","active"].includes(instance.state))
        throw new AuthorizationError("Class available for publication");
      await validateClassAuthority(tx,operator,{
        deploymentId:instance.deploymentId,adoptionId:instance.adoptionId,
        offeringVersionId:instance.offeringVersionId,
        courseVersionId:instance.courseVersionId,
        operatingOrganizationId:instance.operatingOrganizationId,
        siteId:instance.siteId,title:instance.title,deliveryMode:instance.deliveryMode,
      });
      const [terms]=await tx.select({
        id:canonicalClassOfferingVersions.id,state:canonicalClassOfferingVersions.state,
      }).from(canonicalClassOfferingVersions)
        .innerJoin(canonicalClassOfferings,and(
          eq(canonicalClassOfferings.id,canonicalClassOfferingVersions.classOfferingId),
          eq(canonicalClassOfferings.classId,instance.id),
        ))
        .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
          eq(canonicalClassOfferingVersions.classId,instance.id)))
        .for("update").limit(1);
      if(!terms || terms.state!=="draft") throw new AuthorizationError("draft Class Offering version");
      const now=new Date();
      await tx.update(canonicalClassOfferingVersions)
        .set({state:"published",publishedAt:now})
        .where(eq(canonicalClassOfferingVersions.id,terms.id));
      if(instance.state!=="active") await tx.update(canonicalClasses)
        .set({state:"active",updatedAt:now})
        .where(eq(canonicalClasses.id,instance.id));
      await tx.insert(auditEvents).values({
        actorPersonId:operator.actor.actorPersonId!,
        owningOrganizationId:operator.organizationId,
        eventCode:"class.offering_published",entityKind:"class_offering_version",entityId:terms.id,
        payload:{classId:instance.id,operatingOrganizationId:operator.organizationId},
      });
      await tx.insert(domainEvents).values({
        eventType:"ClassOfferingPublished",aggregateType:"class",aggregateId:instance.id,
        actorPersonId:operator.actor.actorPersonId!,
        payload:{classOfferingVersionId:terms.id,organizationId:operator.organizationId},
      });
      return {classId:instance.id,classOfferingVersionId:terms.id,state:"published" as const};
    });
  });

/** Stop registration while preserving learners and class history. */
export const closeUnifiedClassOffering = createServerFn({method:"POST"})
  .validator((raw:unknown) => manageOfferingInput.parse(raw))
  .handler(async({data})=>{
    requireClassFeature();
    const operator=await requireClassOperator();
    return db.transaction(async tx=>{
      const [instance]=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.id,data.classId),
          eq(canonicalClasses.operatingOrganizationId,operator.organizationId)))
        .for("update").limit(1);
      if(!instance || instance.siteId && !operator.siteIds.includes(instance.siteId))
        throw new AuthorizationError("owned Class and Site");
      const [terms]=await tx.select({
        id:canonicalClassOfferingVersions.id,
        state:canonicalClassOfferingVersions.state,
      }).from(canonicalClassOfferingVersions)
        .innerJoin(canonicalClassOfferings,and(
          eq(canonicalClassOfferings.id,canonicalClassOfferingVersions.classOfferingId),
          eq(canonicalClassOfferings.classId,instance.id),
        ))
        .where(and(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId),
          eq(canonicalClassOfferingVersions.classId,instance.id)))
        .for("update").limit(1);
      if(!terms)throw new AuthorizationError("owned Class Offering");
      if(terms.state==="closed")return {closed:true};
      if(terms.state!=="published")
        throw new AuthorizationError("only published Class Offerings can be closed");
      const now=new Date();
      await tx.update(canonicalClassOfferingVersions).set({state:"closed",closedAt:now})
        .where(eq(canonicalClassOfferingVersions.id,data.classOfferingVersionId));
      await tx.insert(auditEvents).values({
        actorPersonId:operator.actor.actorPersonId!,owningOrganizationId:operator.organizationId,
        eventCode:"class.offering_closed",entityKind:"class_offering_version",entityId:data.classOfferingVersionId,
        payload:{classId:instance.id},
      });
      return {closed:true};
    });
  });

/** Re-open registration only by creating a fresh draft version of the terms. */
export const createNextUnifiedClassOfferingVersion = createServerFn({method:"POST"})
  .validator((raw:unknown) => z.object({
    classId:z.string().uuid(),terms:classOfferingTermsSchema,
  }).strict().parse(raw))
  .handler(async({data})=>{
    requireClassFeature();
    const operator=await requireClassOperator();
    return db.transaction(async tx=>{
      const [instance]=await tx.select().from(canonicalClasses)
        .where(and(eq(canonicalClasses.id,data.classId),
          eq(canonicalClasses.operatingOrganizationId,operator.organizationId)))
        .for("update").limit(1);
      if(!instance || !["draft","approved","active"].includes(instance.state))
        throw new AuthorizationError("current Class");
      await validateClassAuthority(tx,operator,{
        deploymentId:instance.deploymentId,adoptionId:instance.adoptionId,
        offeringVersionId:instance.offeringVersionId,courseVersionId:instance.courseVersionId,
        operatingOrganizationId:instance.operatingOrganizationId,
        siteId:instance.siteId,title:instance.title,deliveryMode:instance.deliveryMode,
      });
      const [offering]=await tx.select().from(canonicalClassOfferings)
        .where(eq(canonicalClassOfferings.classId,instance.id)).limit(1);
      if(!offering)throw new AuthorizationError("Class Offering identity");
      const [current]=await tx.select().from(canonicalClassOfferingVersions)
        .where(eq(canonicalClassOfferingVersions.classOfferingId,offering.id))
        .orderBy(desc(canonicalClassOfferingVersions.versionNo)).limit(1);
      if(!current || current.state!=="closed")
        throw new AuthorizationError("close the previous published Class Offering first");
      const [created]=await tx.insert(canonicalClassOfferingVersions).values({
        classId:instance.id,classOfferingId:offering.id,versionNo:current.versionNo+1,
        visibility:data.terms.visibility,enrollmentMethods:data.terms.enrollmentMethods,
        opensAt:data.terms.opensAt?new Date(data.terms.opensAt):null,
        closesAt:data.terms.closesAt?new Date(data.terms.closesAt):null,
        capacity:data.terms.capacity,consentVersion:data.terms.consentVersion,
        consentText:data.terms.consentText,createdByPersonId:operator.actor.actorPersonId!,
        state:"draft",
      }).returning({id:canonicalClassOfferingVersions.id});
      if(!created)throw new Error("Cannot create Class Offering version");
      await tx.insert(auditEvents).values({
        actorPersonId:operator.actor.actorPersonId!,owningOrganizationId:operator.organizationId,
        eventCode:"class.offering_new_draft",entityKind:"class_offering_version",
        entityId:created.id,payload:{classId:instance.id,versionNo:current.versionNo+1},
      });
      return {classOfferingVersionId:created.id,versionNo:current.versionNo+1};
    });
  });
