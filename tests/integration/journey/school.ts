/**
 * School journey scenario — one canonical launch of an independent school
 * Program: real Organization/Site/Program through the actual launch commands,
 * an independent publisher course + pack through the authoring workflow,
 * marketplace adoption, a provisioned Section, a verified eligible teacher,
 * and activation through the Launch Journey.
 *
 * This composes the exact command sequence proven in the FullFlow six-stage
 * acceptance test so journeys C–H start from an identical, trustworthy school
 * without copy-pasting ~300 lines of setup. Only identity, legal-entity,
 * catalog and reference scaffolding is inserted directly; every school,
 * curriculum, staffing and activation fact goes through its canonical command.
 */
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { createAcademicTimeFixture } from "../helpers/academic-time";
import { first, type JourneyTools } from "./harness";
import { createPersona, withScope, type JourneyPersona } from "./personas";

export type JourneySchool = Awaited<ReturnType<typeof launchJourneySchool>>;

export async function launchJourneySchool(
  journey: JourneyTools,
  input: {
    suffix: string;
    name?: string;
    type?: string;
    gradeRange?: { min: string; max: string };
    deliveryModel?: Record<string, unknown>;
    time?: {
      startsOn?: string;
      endsOn?: string;
      termStartsOn?: string;
      termEndsOn?: string;
      calendarDays?: Array<{ date: string; type?: string; instructionalMinutes?: number }>;
      scheduleDays?: number[];
    };
    section?: { code?: string; title?: string; credits?: number };
    /** Link the Section to the schedule template so onsite supervision applies. */
    onsiteSchedule?: boolean;
    /** Configure the canonical family enrollment Journey on the Program. */
    enrollmentJourney?: boolean;
    /** Complete blocking launch requirements and activate (default true). */
    activate?: boolean;
  },
) {
  const { tx, setActor } = journey;
  const suffix = input.suffix;
  const launch = await import("@/modules/programs/launch.functions");
  const curricula = await import("@/modules/learning/curriculum-authoring.functions");
  const packs = await import("@/modules/learning/publisher-pack-authoring.functions");
  const market = await import("@/modules/learning/curriculum-marketplace.functions");
  const sections = await import("@/modules/programs/launch-academics.functions");

  // Bootstrap scaffolding only: legal entities, jurisdiction and the launch
  // definition. The school Site/Program themselves come from launch commands.
  const school = first(await tx.insert(s.organizations).values({
    type: "christian_school",
    name: input.name ?? `Journey School ${suffix}`,
    slug: `journey-school-${suffix}`,
  }).returning());
  const publisherOrg = first(await tx.insert(s.organizations).values({
    type: "christian_school",
    name: `Journey Publisher ${suffix}`,
    slug: `journey-publisher-${suffix}`,
  }).returning());
  const jurisdiction = first(await tx.insert(s.jurisdictions).values({
    code: `journey-${suffix}`,
    name: "Synthetic journey jurisdiction",
  }).returning());
  await tx.insert(s.journeyDefinitions).values({
    key: "program-launch",
    version: `journey-${suffix}`,
    owningOrganizationId: school.id,
    audience: "partner",
    title: "Journey school launch",
    configuration: {
      requirements: [
        { key: "school-readiness", title: "School readiness", owner: "partner", blocking: true },
        { key: "academic-setup", title: "Academic setup", owner: "partner", blocking: true },
      ],
    },
  });

  const operator = await createPersona(tx, {
    key: "operator", role: "registrar", organizationId: school.id,
    firstName: "Journey", lastName: "Operator", suffix,
  });
  setActor(operator.actor);

  const createdSite = await launch.createLaunchSite({ data: {
    organizationId: school.id,
    name: "Journey Campus",
    slug: `journey-campus-${suffix}`,
    timezone: "America/Los_Angeles",
  } });
  const site = first(await tx.select().from(s.sites).where(eq(s.sites.id, createdSite.siteId)));
  const programLaunch = await launch.startLaunch({ data: {
    hostOrganizationId: school.id,
    siteId: site.id,
    jurisdictionId: jurisdiction.id,
    type: input.type ?? "high_school_extension",
    name: `Journey Program ${suffix}`,
    slug: `journey-program-${suffix}`,
    gradeRange: input.gradeRange ?? { min: "9", max: "12" },
    deliveryModel: input.deliveryModel ?? { asynchronous: true, onsite: true, onsiteDaysPerWeek: 2 },
    academicProviderOrganizationId: school.id,
    creditIssuingOrganizationId: school.id,
  } });
  const programId = programLaunch.programId;
  const program = first(await tx.select().from(s.programs).where(eq(s.programs.id, programId)));
  const operatorScoped = withScope(operator, { siteIds: [site.id], programIds: [programId] });
  setActor(operatorScoped);
  const time = await createAcademicTimeFixture({
    organizationId: school.id,
    siteId: site.id,
    programId,
    suffix,
    ...input.time,
  });

  // Independent publisher organization: canonical author → publish workflow.
  const publisherSite = first(await tx.insert(s.sites).values({
    organizationId: publisherOrg.id,
    name: "Publisher Workspace",
    slug: `journey-publisher-site-${suffix}`,
  }).returning());
  const publisherProgram = first(await tx.insert(s.programs).values({
    organizationId: publisherOrg.id,
    siteId: publisherSite.id,
    jurisdictionId: jurisdiction.id,
    type: "full_school",
    status: "active",
    name: "Publisher Studio",
    slug: `journey-publisher-studio-${suffix}`,
    gradeRange: { min: "9", max: "12" },
    deliveryModel: { asynchronous: true },
    academicProviderOrganizationId: publisherOrg.id,
    creditIssuingOrganizationId: publisherOrg.id,
  }).returning());
  const publisher = await createPersona(tx, {
    key: "publisher", role: "registrar", organizationId: publisherOrg.id,
    siteId: publisherSite.id, firstName: "Journey", lastName: "Publisher", suffix,
    programIds: [publisherProgram.id],
  });
  await tx.insert(s.memberships).values({
    personId: publisher.person.id,
    organizationId: publisherOrg.id,
  });
  await tx.insert(s.roleAssignments).values({
    personId: publisher.person.id,
    organizationId: publisherOrg.id,
    siteId: publisherSite.id,
    programId: publisherProgram.id,
    roleKey: "curriculum_publisher",
    capabilities: ["curriculum.publish"],
  });
  setActor(publisher.actor);
  const pubScope = { programId: publisherProgram.id };
  const authored = await curricula.createAuthoredCourse({ data: {
    ...pubScope,
    code: `JRN-${suffix}`,
    title: "Journey Algebra I",
    subject: "Mathematics",
    requestId: crypto.randomUUID(),
  } });
  const draft = await curricula.startCurriculumDraft({ data: {
    ...pubScope,
    courseId: authored.courseId,
    requestId: crypto.randomUUID(),
  } });
  const studio = await curricula.getCurriculumStudio({ data: pubScope });
  const initial = first(first(studio.courses.filter(x => x.id === authored.courseId))
    .releases.filter(x => x.id === draft.versionId));
  const saved = await curricula.saveAuthoredCurriculum({ data: {
    ...pubScope,
    versionId: draft.versionId,
    expectedRevision: initial.revision,
    content: {
      version: 1,
      syllabus: "Journey Algebra I: equations and explanations.",
      modules: [{
        id: "equations",
        title: "Linear Equations",
        lessons: [{
          id: "solve-one",
          title: "Solving for x",
          body: "Solve 3x + 5 = 20 and explain each step.",
          resources: [],
        }],
      }],
      resources: [],
    },
  } });
  await curricula.publishAuthoredCurriculum({ data: {
    ...pubScope,
    versionId: draft.versionId,
    expectedRevision: saved.revision,
    reason: "Publisher confirms course content for journey adoption.",
    confirmed: true,
  } });
  const pack = await packs.createAuthoredPublisherPack({ data: {
    ...pubScope,
    slug: `journey-algebra-${suffix}`,
    name: "Journey Algebra I Pack",
    description: "Synthetic curriculum pack for journey acceptance",
    visibility: "public",
    licenseCode: "CC-BY-4.0",
    requestId: crypto.randomUUID(),
  } });
  const packStudio = await packs.getPublisherPackStudio({ data: pubScope });
  const firstRevision = first(first(packStudio.packs.filter(x => x.id === pack.packId))
    .releases.filter(x => x.id === pack.versionId));
  const packed = await packs.saveAuthoredPublisherPack({ data: {
    ...pubScope,
    versionId: pack.versionId,
    expectedRevision: firstRevision.revision,
    courseVersionIds: [draft.versionId],
  } });
  await packs.publishAuthoredPublisherPack({ data: {
    ...pubScope,
    versionId: pack.versionId,
    expectedRevision: packed.revision,
    reason: "Publisher approves a new journey Algebra I release.",
    confirmed: true,
  } });

  // Separate adopter identity: selects curriculum but cannot author in the
  // publisher's organization.
  const adopter = await createPersona(tx, {
    key: "adopter", role: "registrar", organizationId: school.id,
    siteId: site.id, firstName: "Journey", lastName: "Adopter", suffix,
    programIds: [programId],
  });
  await tx.insert(s.memberships).values({
    personId: adopter.person.id,
    organizationId: school.id,
  });
  await tx.insert(s.roleAssignments).values({
    personId: adopter.person.id,
    organizationId: school.id,
    siteId: site.id,
    programId,
    roleKey: "curriculum_adopter",
    capabilities: ["curriculum.adopt"],
  });
  setActor(adopter.actor);
  const marketScope = { programId };
  await market.installCurriculumPack({ data: {
    ...marketScope,
    packId: pack.packId,
    termsAccepted: true,
  } });
  await market.adoptCurriculumPack({ data: {
    ...marketScope,
    packId: pack.packId,
    versionId: pack.versionId,
  } });

  setActor(operatorScoped);
  const provisioned = await sections.provisionLaunchSection({ data: {
    programId,
    termId: time.term.id,
    courseTemplateVersionId: draft.versionId,
    code: input.section?.code ?? `JRN-ALG-${suffix}`,
    title: input.section?.title ?? "Algebra I",
    credits: input.section?.credits ?? 1,
  } });
  const section = first(await tx.select().from(s.sections)
    .where(eq(s.sections.id, provisioned.sectionId)));
  if (input.onsiteSchedule) {
    // Schedule linkage is prerequisite fixture configuration, like the
    // calendar itself; supervision/attendance behavior stays canonical.
    await tx.update(s.sections)
      .set({ scheduleTemplateId: time.scheduleTemplate.id })
      .where(eq(s.sections.id, section.id));
  }

  // Verified, eligible teacher: qualification policy + independently reviewed
  // claim, then the canonical assignment command.
  const teacher = await createPersona(tx, {
    key: "teacher", role: "teacher", organizationId: school.id, siteId: site.id,
    firstName: "Journey", lastName: "Instructor", suffix, emailVerified: true,
    programIds: [programId],
  });
  await tx.insert(s.roleAssignments).values({
    personId: teacher.person.id,
    organizationId: school.id,
    siteId: site.id,
    programId,
    roleKey: "teacher",
  });
  await tx.insert(s.memberships).values({
    personId: operator.person.id,
    organizationId: school.id,
  });
  await tx.insert(s.roleAssignments).values({
    personId: operator.person.id,
    organizationId: school.id,
    siteId: site.id,
    programId,
    roleKey: "staffing_policy_publisher",
    capabilities: ["staffing.policy.publish"],
  });
  const qualification = first(await tx.insert(s.qualificationDefinitions).values({
    key: `journey-instructor-${suffix}`,
    kind: "license",
    title: "Synthetic journey instructor qualification",
  }).returning());
  await sections.publishLaunchTeacherPolicy({ data: {
    programId,
    qualificationKeys: [qualification.key],
    confirmed: true,
  } });
  const claim = first(await tx.insert(s.qualificationClaims).values({
    personId: teacher.person.id,
    definitionId: qualification.id,
    issuedAt: new Date("2026-01-01"),
    expiresAt: new Date("2028-12-31"),
  }).returning());
  await tx.insert(s.qualificationVerificationEvents).values({
    claimId: claim.id,
    sequence: 1,
    decision: "approve",
    actorPersonId: operator.person.id,
  });
  // Dynamic journey dates must not inherit stale fixed 2027 cutoffs. Keep
  // the original FullFlow fixture defaults for callers without a date override.
  const registrationWindowEndsOn = input.time?.termEndsOn ?? input.time?.endsOn;
  await tx.insert(s.sectionRegistrationPolicies).values({
    sectionId: section.id,
    enrollmentCapacity: 24,
    addDropEndsOn: registrationWindowEndsOn ?? "2027-10-01",
    withdrawalEndsOn: registrationWindowEndsOn ?? "2027-12-01",
  });

  // Site leader doubles as the scheduled onsite facilitator so supervision
  // duty and day-review attestation have a real authorized adult.
  const siteLeader = await createPersona(tx, {
    key: "site-leader", role: "site_leader", organizationId: school.id,
    siteId: site.id, firstName: "Journey", lastName: "Site Leader", suffix,
    emailVerified: true, programIds: [programId],
  });
  await tx.insert(s.deliveryArrangements).values({
    sectionId: section.id,
    academicProviderOrganizationId: school.id,
    facilitatorPersonId: siteLeader.person.id,
    modality: "onsite",
    status: "active",
  });
  const assigned = await sections.assignLaunchTeacher({ data: {
    programId,
    sectionId: section.id,
    teacherPersonId: teacher.person.id,
  } });
  if (!assigned.created) throw new Error("Journey teacher assignment did not occur");

  // A site-based launch requires an independently held, active, local
  // receiving-operator grant even when the creator has org-wide access.
  await tx.insert(s.accountPersonGrants).values({
    accountId: operator.account.id,
    personId: operator.person.id,
    role: "registrar",
    organizationId: school.id,
    siteId: site.id,
    active: true,
  });

  // Configured family enrollment Journey on the Program (GF22/GF2 handoff).
  let enrollmentDefinitionKey: string | undefined;
  if (input.enrollmentJourney !== false) {
    enrollmentDefinitionKey = `journey-enrollment-${suffix}`;
    await tx.insert(s.journeyDefinitions).values({
      key: enrollmentDefinitionKey,
      version: "1",
      audience: "family",
      owningOrganizationId: school.id,
      title: "Journey enrollment agreement",
      configuration: {
        requirements: [
          { key: "school-review", title: "School enrollment review", owner: "can", blocking: true },
          {
            key: "school-consent",
            title: "School consent form",
            owner: "family",
            blocking: true,
            enrollmentForm: {
              version: "journey-synthetic-1",
              instructions: "Synthetic consent for connected school acceptance only.",
              consent: "I acknowledge this synthetic school enrollment statement.",
              fields: [{ key: "contact_plan", label: "Contact plan", type: "text", required: true }],
            },
          },
        ],
      },
    });
    await tx.update(s.programs).set({
      metadata: { ...program.metadata, enrollmentJourneyDefinitionKey: enrollmentDefinitionKey },
    }).where(eq(s.programs.id, programId));
    // Seat capacity is school configuration, shared by every family applying
    // to this Program/SchoolYear in the journey.
    await tx.insert(s.admissionSeatPools).values({
      programId,
      schoolYearId: time.schoolYear.id,
      capacity: 24,
    });
  }

  if (input.activate !== false) {
    const { completeJourneyRequirement } = await import("@/modules/journeys/complete-requirement");
    const readiness = await tx.select().from(s.journeyRequirements)
      .where(eq(s.journeyRequirements.journeyId, programLaunch.journeyId));
    for (const requirement of readiness) {
      await completeJourneyRequirement(operatorScoped, requirement.id,
        [{ fact: `journey-${requirement.key}-verified` }]);
    }
    await launch.activateLaunch({ data: {
      programId,
      recipientPersonId: operator.person.id,
    } });
    const activated = first(await tx.select().from(s.programs).where(eq(s.programs.id, programId)));
    if (activated.status !== "active") throw new Error("Journey program did not activate");
  }

  setActor(operatorScoped);
  return {
    suffix,
    school,
    publisherOrg,
    jurisdiction,
    site,
    program,
    launchJourneyId: programLaunch.journeyId,
    time,
    publisher: { person: publisher, site: publisherSite, program: publisherProgram },
    courseVersionId: draft.versionId,
    packId: pack.packId,
    packVersionId: pack.versionId,
    section,
    teacher,
    operator,
    operatorScoped,
    adopter,
    siteLeader,
    enrollmentDefinitionKey,
  };
}
