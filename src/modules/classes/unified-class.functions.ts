import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or } from "drizzle-orm";
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
        visibility:data.terms.visibility,enrollmentMethod:data.terms.enrollmentMethod,
        opensAt:data.terms.opensAt?new Date(data.terms.opensAt):null,
        closesAt:data.terms.closesAt?new Date(data.terms.closesAt):null,
        capacity:data.terms.capacity,state:"draft",
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
      enrollmentMethod:canonicalClassOfferingVersions.enrollmentMethod,
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
