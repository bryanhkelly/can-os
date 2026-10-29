import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Transaction | undefined,
  actor: undefined as AccessContext | undefined,
}));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("FullFlow must use one rollback-isolated transaction");
    return state.tx;
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: {data: unknown}) => unknown) {
      return async (input?: {data: unknown}) => callback({data: this.parse(input?.data)});
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"),
  setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => {
    if (!state.actor) throw new Error("FullFlow actor not selected");
    return state.actor;
  },
}));

function first<T>(list: T[]): T {
  if (!list.length) throw new Error("Expected persistent FullFlow record");
  return list[0]!;
}
const databaseConfigured = Boolean(process.env.DATABASE_URL);
if (databaseConfigured && (process.env.CAN_TEST_DB_WRITES_ENABLED !== "true" ||
    process.env.APP_ENV !== "test" || !process.env.TEST_DATABASE_URL ||
    process.env.DATABASE_URL !== process.env.TEST_DATABASE_URL)) {
  throw new Error("FullFlow requires the guarded isolated-test database runner");
}
const integration = databaseConfigured ? describe : describe.skip;

integration("FullFlow: one school and Program across the six-stage academic journey", () => {
  it("connects launch, curriculum, verified family enrollment, learning, grading and operations", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const launch = await import("@/modules/programs/launch.functions");
    const curricula = await import("@/modules/learning/curriculum-authoring.functions");
    const packs = await import("@/modules/learning/publisher-pack-authoring.functions");
    const market = await import("@/modules/learning/curriculum-marketplace.functions");
    const sections = await import("@/modules/programs/launch-academics.functions");
    const { createAcademicTimeFixture } = await import("./helpers/academic-time");
    const rollback = new Error("rollback-fullflow");
    const suffix = crypto.randomUUID().slice(0, 8);
    let ids: {programId: string; siteId: string; sectionId: string; versionId: string} | undefined;
    let completed = false;
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        // Bootstrap only identity, host/publisher legal entities, independent catalog
        // and launch definition. The tested school Site, Program, published course,
        // school adoption and Section must come from their canonical commands.
        const school = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "FullFlow Independent K-8",
          slug: `fullflow-school-${suffix}`,
        }).returning());
        const publisherOrg = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "FullFlow Curriculum Publisher",
          slug: `fullflow-publisher-${suffix}`,
        }).returning());
        const jurisdiction = first(await tx.insert(s.jurisdictions).values({
          code: `fullflow-${suffix}`, name: "Synthetic school jurisdiction",
        }).returning());
        await tx.insert(s.journeyDefinitions).values({
          key: "program-launch", version: `fullflow-${suffix}`,
          owningOrganizationId: school.id, audience: "partner",
          title: "FullFlow high-school extension launch",
          configuration: { requirements: [
            { key: "school-readiness", title: "School readiness", owner: "partner", blocking: true },
            { key: "academic-setup", title: "Academic setup", owner: "partner", blocking: true },
          ] },
        });
        const schoolOperator = first(await tx.insert(s.people).values({
          legalFirstName: "School", legalLastName: "FullFlow Operator",
        }).returning());
        const publisherPerson = first(await tx.insert(s.people).values({
          legalFirstName: "Course", legalLastName: "FullFlow Publisher",
        }).returning());
        const adopterPerson = first(await tx.insert(s.people).values({
          legalFirstName: "School", legalLastName: "FullFlow Adopter",
        }).returning());
        const schoolAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `operator-${suffix}@example.test`,
        }).returning());
        const schoolGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: schoolAccount.id, personId: schoolOperator.id,
          role: "registrar", organizationId: school.id, siteId: null, active: true,
        }).returning());
        const context = (personId: string, organizationId: string,
          siteIds: string[], programIds: string[]): AccessContext => ({
          actorPersonId: personId, role: "registrar", accountId: schoolAccount.id,
          sessionId: `fullflow-${suffix}`, grantId: schoolGrant.id,
          grantSiteId: null, capabilities: new Set(roleCapabilities.registrar),
          scope: {organizationIds: [organizationId], siteIds, programIds},
        });
        state.actor = context(schoolOperator.id, school.id, [], []);
        const created = await launch.createLaunchSite({ data: {
          organizationId: school.id, name: "FullFlow Campus",
          slug: `fullflow-campus-${suffix}`, timezone: "America/Los_Angeles",
        } });
        const site = first(await tx.select().from(s.sites).where(eq(s.sites.id, created.siteId)));
        expect(site.organizationId).toBe(school.id);
        const programLaunch = await launch.startLaunch({ data: {
          hostOrganizationId: school.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: "high_school_extension", name: "FullFlow High School Extension",
          slug: `fullflow-highschool-${suffix}`,
          gradeRange: { min: "9", max: "12" },
          deliveryModel: { asynchronous: true, onsite: true, onsiteDaysPerWeek: 2 },
          academicProviderOrganizationId: school.id,
          creditIssuingOrganizationId: school.id,
        } });
        const programId = programLaunch.programId;
        const program = first(await tx.select().from(s.programs).where(eq(s.programs.id, programId)));
        expect(program).toMatchObject({
          organizationId: school.id, siteId: site.id, type: "high_school_extension",
          status: "launching", gradeRange: {min: "9", max: "12"},
        });
        expect(first(await tx.select().from(s.journeys).where(eq(s.journeys.id, programLaunch.journeyId))).programId)
          .toBe(programId);
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        const time = await createAcademicTimeFixture({
          organizationId: school.id, siteId: site.id, programId, suffix,
        });

        // A separate publisher uses the same canonical author/publish workflow.
        // Its own Program is a publishing prerequisite; it is NOT the host school.
        const publisherSite = first(await tx.insert(s.sites).values({
          organizationId: publisherOrg.id, name: "Publisher Workspace",
          slug: `publisher-site-${suffix}`,
        }).returning());
        const publisherProgram = first(await tx.insert(s.programs).values({
          organizationId: publisherOrg.id, siteId: publisherSite.id,
          jurisdictionId: jurisdiction.id, type: "full_school",
          status: "active", name: "Publisher Studio",
          slug: `publisher-studio-${suffix}`,
          gradeRange: {min: "9", max: "12"}, deliveryModel: {asynchronous: true},
          academicProviderOrganizationId: publisherOrg.id,
          creditIssuingOrganizationId: publisherOrg.id,
        }).returning());
        await tx.insert(s.memberships).values({
          personId: publisherPerson.id, organizationId: publisherOrg.id,
        });
        await tx.insert(s.roleAssignments).values({
          personId: publisherPerson.id, organizationId: publisherOrg.id,
          siteId: publisherSite.id, programId: publisherProgram.id,
          roleKey: "curriculum_publisher", capabilities: ["curriculum.publish"],
        });
        state.actor = context(publisherPerson.id, publisherOrg.id,
          [publisherSite.id], [publisherProgram.id]);
        const pubScope = { programId: publisherProgram.id };
        const authored = await curricula.createAuthoredCourse({data: {
          ...pubScope, code: `FFMATH-${suffix}`, title: "FullFlow Algebra I",
          subject: "Mathematics", requestId: crypto.randomUUID(),
        }});
        const draft = await curricula.startCurriculumDraft({ data: {
          ...pubScope, courseId: authored.courseId, requestId: crypto.randomUUID(),
        }});
        const studio = await curricula.getCurriculumStudio({data: pubScope});
        const initial = first(first(studio.courses.filter(x => x.id === authored.courseId))
          .releases.filter(x => x.id === draft.versionId));
        const saved = await curricula.saveAuthoredCurriculum({data: {
          ...pubScope, versionId: draft.versionId, expectedRevision: initial.revision,
          content: { version: 1, syllabus: "FullFlow Algebra I: equations and explanations.",
            modules: [{id: "equations", title: "Linear Equations",
              lessons: [{id: "solve-one", title: "Solving for x",
                body: "Solve 3x + 5 = 20 and explain each step.", resources: []}]}],
            resources: [] },
        }});
        await curricula.publishAuthoredCurriculum({data: {
          ...pubScope, versionId: draft.versionId, expectedRevision: saved.revision,
          reason: "Publisher confirms course content for high-school adoption.", confirmed: true,
        }});
        const pack = await packs.createAuthoredPublisherPack({data: {
          ...pubScope, slug: `ff-algebra-${suffix}`, name: "FullFlow Algebra I Pack",
          description: "Synthetic curriculum pack for joined acceptance",
          visibility: "public", licenseCode: "CC-BY-4.0", requestId: crypto.randomUUID(),
        }});
        const packStudio = await packs.getPublisherPackStudio({data: pubScope});
        const firstRevision = first(first(packStudio.packs.filter(x => x.id === pack.packId))
          .releases.filter(x => x.id === pack.versionId));
        const packed = await packs.saveAuthoredPublisherPack({data: {
          ...pubScope, versionId: pack.versionId, expectedRevision: firstRevision.revision,
          courseVersionIds: [draft.versionId],
        }});
        await packs.publishAuthoredPublisherPack({data: {
          ...pubScope, versionId: pack.versionId, expectedRevision: packed.revision,
          reason: "Publisher approves a new Algebra I release.", confirmed: true,
        }});

        // School adopter may select curriculum but has no authority to author in
        // the publisher's org. Keep this authorization separate from school launch.
        await tx.insert(s.memberships).values({
          personId: adopterPerson.id, organizationId: school.id,
        });
        await tx.insert(s.roleAssignments).values({
          personId: adopterPerson.id, organizationId: school.id, siteId: site.id,
          programId, roleKey: "curriculum_adopter", capabilities: ["curriculum.adopt"],
        });
        state.actor = context(adopterPerson.id, school.id, [site.id], [programId]);
        await expect(curricula.getCurriculumStudio({data: {programId}})).rejects.toThrow();
        const marketScope = {programId};
        expect((await market.getCurriculumMarketplace({data: marketScope}))
          .packs.some(p => p.id === pack.packId)).toBe(true);
        expect((await market.installCurriculumPack({data: {
          ...marketScope, packId: pack.packId, termsAccepted: true,
        }})).installed).toBe(true);
        expect((await market.adoptCurriculumPack({data: {
          ...marketScope, packId: pack.packId, versionId: pack.versionId,
        }})).adopted).toBe(true);

        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        const provisioned = await sections.provisionLaunchSection({data: {
          programId, termId: time.term.id, courseTemplateVersionId: draft.versionId,
          code: `FF-ALG-${suffix}`, title: "Algebra I", credits: 1,
        }});
        const section = first(await tx.select().from(s.sections)
          .where(eq(s.sections.id, provisioned.sectionId)));
        expect(section.programId).toBe(programId);
        expect(section.siteId).toBe(site.id);
        expect(section.courseTemplateVersionId).toBe(draft.versionId);
        expect(first(await tx.select().from(s.courseTemplateVersions)
          .where(eq(s.courseTemplateVersions.id, draft.versionId))).status).toBe("published");
        const matching = await tx.select({id: s.domainEvents.id}).from(s.domainEvents)
          .where(and(eq(s.domainEvents.aggregateId, section.id),
            eq(s.domainEvents.eventType, "SectionProvisioned")));
        expect(matching).toHaveLength(1);
        // The school now provisions an actual instructor, not a placeholder
        // section-teacher row. Eligibility is checked against a school-scoped
        // qualification policy and independently reviewed claim.
        const teacher = first(await tx.insert(s.people).values({
          legalFirstName: "FullFlow", legalLastName: "Algebra Instructor",
        }).returning());
        const teacherAccount=first(await tx.insert(s.accessAccounts).values({
          emailNormalized:"fullflow-teacher-"+teacher.id+"@example.com",emailVerifiedAt:new Date(),
        }).returning());
        await tx.insert(s.accountPersonGrants).values({
          accountId:teacherAccount.id,personId:teacher.id,organizationId:school.id,
          siteId:site.id,role:"teacher",active:true,isSynthetic:false,
        });
        await tx.insert(s.roleAssignments).values({
          personId: teacher.id, organizationId: school.id, siteId: site.id,
          programId, roleKey: "teacher",
        });
        await tx.insert(s.memberships).values({
          personId: schoolOperator.id, organizationId: school.id,
        });
        await tx.insert(s.roleAssignments).values({
          personId: schoolOperator.id, organizationId: school.id, siteId: site.id,
          programId, roleKey: "staffing_policy_publisher",
          capabilities: ["staffing.policy.publish"],
        });
        const qualification = first(await tx.insert(s.qualificationDefinitions).values({
          key: `fullflow-instructor-${suffix}`, kind: "license",
          title: "Synthetic full-flow Algebra instructor qualification",
        }).returning());
        await sections.publishLaunchTeacherPolicy({ data: {
          programId, qualificationKeys: [qualification.key], confirmed: true,
        } });
        const claim = first(await tx.insert(s.qualificationClaims).values({
          personId: teacher.id, definitionId: qualification.id,
          issuedAt: new Date("2026-01-01"), expiresAt: new Date("2028-12-31"),
        }).returning());
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId: claim.id, sequence: 1, decision: "approve",
          actorPersonId: schoolOperator.id,
        });
        await tx.insert(s.sectionRegistrationPolicies).values({
          sectionId: section.id, enrollmentCapacity: 24,
          addDropEndsOn: "2027-10-01", withdrawalEndsOn: "2027-12-01",
        });
        await tx.insert(s.deliveryArrangements).values({
          sectionId: section.id, academicProviderOrganizationId: school.id,
          facilitatorPersonId: schoolOperator.id,
          modality: "onsite", status: "active",
        });
        const assigned = await sections.assignLaunchTeacher({ data: {
          programId, sectionId: section.id, teacherPersonId: teacher.id,
        } });
        expect(assigned.created).toBe(true);
        expect(await tx.select().from(s.sectionTeachers).where(and(
          eq(s.sectionTeachers.sectionId, section.id),
          eq(s.sectionTeachers.personId, teacher.id),
        ))).toHaveLength(1);
        expect(await tx.select().from(s.deliveryArrangements).where(and(
          eq(s.deliveryArrangements.sectionId, section.id),
          eq(s.deliveryArrangements.instructorPersonId, teacher.id),
          eq(s.deliveryArrangements.status, "active"),
        ))).toHaveLength(1);
        // A site-based launch requires an independently held, active, local
        // receiving-operator grant even when the creator has org-wide access.
        await tx.insert(s.accountPersonGrants).values({
          accountId: schoolAccount.id, personId: schoolOperator.id,
          role: "registrar", organizationId: school.id, siteId: site.id, active: true,
        });
        const {completeJourneyRequirement} = await import("@/modules/journeys/complete-requirement");
        const readiness = await tx.select().from(s.journeyRequirements)
          .where(eq(s.journeyRequirements.journeyId, programLaunch.journeyId));
        for (const requirement of readiness) {
          await completeJourneyRequirement(state.actor!, requirement.id,
            [{fact: `fullflow-${requirement.key}-verified`}]);
        }
        await launch.activateLaunch({data: {
          programId, recipientPersonId: schoolOperator.id,
        }});
        expect(first(await tx.select().from(s.programs).where(eq(s.programs.id, programId))).status)
          .toBe("active");
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId, programId),
          eq(s.domainEvents.eventType, "ProgramActivated"),
        ))).toHaveLength(1);
        // The family enters the VERY SAME newly activated Program, not an
        // unrelated pre-seeded admissions demo. Offer, consent and placement
        // use the existing canonical school and guardian commands.
        const familyApplications = await import("@/modules/enrollment/guardian-family-applications.functions");
        const familyReadiness = await import("@/modules/enrollment/family-readiness.functions");
        const familyForms = await import("@/modules/enrollment/enrollment-form.functions");
        const familyChecklist = await import("@/modules/enrollment/guardian-enrollment-checklist.functions");
        const offerCommands = await import("@/modules/enrollment/admissions-offer.functions");
        const placements = await import("@/modules/enrollment/course-placement.functions");
        const guardian = first(await tx.insert(s.people).values({
          legalFirstName: "FullFlow", legalLastName: "Family Guardian",
        }).returning());
        const outsider = first(await tx.insert(s.people).values({
          legalFirstName: "Unauthorized", legalLastName: "Guardian",
        }).returning());
        const guardianAccount=first(await tx.insert(s.accessAccounts).values({
          emailNormalized:"fullflow-guardian-"+suffix+"@example.test",emailVerifiedAt:new Date(),
        }).returning());
        const guardianGrant=first(await tx.insert(s.accountPersonGrants).values({
          accountId:guardianAccount.id,personId:guardian.id,role:"guardian",
          organizationId:school.id,siteId:site.id,active:true,isSynthetic:false,
        }).returning());
        const guardianActor: AccessContext = {
          ...context(guardian.id, school.id, [site.id], [programId]),
          role: "guardian", capabilities: new Set(roleCapabilities.guardian),
          accountId: guardianAccount.id, grantId: guardianGrant.id,grantSiteId:site.id,
        };
        const unrelatedActor: AccessContext = {...guardianActor,actorPersonId: outsider.id};
        const applicationDefinitionKey = `fullflow-enrollment-${suffix}`;
        await tx.insert(s.journeyDefinitions).values({
          key: applicationDefinitionKey, version: "1", audience: "family",
          owningOrganizationId: school.id, title: "FullFlow enrollment agreement",
          configuration: {requirements: [
            {key: "school-review", title: "School enrollment review",
              owner: "can", blocking: true},
            {key: "school-consent", title: "School consent form",
              owner: "family", blocking: true, enrollmentForm: {
                version: "fullflow-synthetic-1",
                instructions: "Synthetic consent for connected school acceptance only.",
                consent: "I acknowledge this synthetic school enrollment statement.",
                fields: [{key: "contact_plan",label: "Contact plan",
                  type: "text",required: true}],
              }},
          ]},
        });
        const applicationProgram=first(await tx.select().from(s.programs).where(eq(s.programs.id,programId)));
        await tx.update(s.programs).set({metadata:{
          ...applicationProgram.metadata,enrollmentJourneyDefinitionKey:applicationDefinitionKey,
        }}).where(eq(s.programs.id,programId));
        state.actor=guardianActor;
        const familyApplicationInput={programId,requestId:crypto.randomUUID(),
          studentFirstName:"FullFlow",studentLastName:"Learner",gradeLevel:"9"};
        const application=await familyApplications.startGuardianFamilyApplication({data:familyApplicationInput});
        expect(await familyApplications.startGuardianFamilyApplication({data:familyApplicationInput}))
          .toEqual(application);
        const applicationRow = first(await tx.select().from(s.applications)
          .where(eq(s.applications.id,application.applicationId)));
        expect(applicationRow.programId).toBe(programId);
        const profile = first(await tx.select().from(s.studentProfiles)
          .where(eq(s.studentProfiles.id,applicationRow.studentProfileId)));
        expect(await tx.select().from(s.guardianRelationships).where(and(
          eq(s.guardianRelationships.guardianPersonId,guardian.id),
          eq(s.guardianRelationships.studentPersonId,profile.personId),
        ))).toHaveLength(1);


        // Self-asserted parenthood cannot authorize enrollment forms. Exercise
        // the real independent registrar verification before the family proceeds.
        state.actor = guardianActor;
        await expect(familyChecklist.getGuardianEnrollmentChecklist({
          data:{applicationId:application.applicationId},
        })).rejects.toThrow("independently verified managing guardian relationship");
        const {verifyAdmissionsGuardianRelationship}=await import(
          "@/modules/enrollment/admissions-intake.functions");
        const guardianVerification={
          applicationId:application.applicationId,method:"verified_school_record" as const,
          evidenceNote:"Synthetic school record independently checked for this acceptance family.",
        };
        await expect(verifyAdmissionsGuardianRelationship({data:guardianVerification}))
          .rejects.toThrow("admissions registrar");
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        await verifyAdmissionsGuardianRelationship({data:guardianVerification});
        await verifyAdmissionsGuardianRelationship({data:guardianVerification});
        const relationship=first(await tx.select().from(s.guardianRelationships).where(and(
          eq(s.guardianRelationships.guardianPersonId,guardian.id),
          eq(s.guardianRelationships.studentPersonId,profile.personId),
        )));
        expect(relationship.metadata).toMatchObject({
          verification:"verified",verifiedBy:schoolOperator.id,
        });
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,relationship.id),
          eq(s.auditEvents.action,"admissions.guardian_relationship.verify"),
        ))).toHaveLength(1);

        const applicationJourney=first(await tx.select().from(s.journeys).where(and(
          eq(s.journeys.participantType,"application"),eq(s.journeys.participantId,application.applicationId),
        )));
        const familyRequirements = await tx.select().from(s.journeyRequirements)
          .where(eq(s.journeyRequirements.journeyId,applicationJourney.id));
        const review = first(familyRequirements.filter(x=>x.key==="school-review"));
        const form = first(familyRequirements.filter(x=>x.key==="school-consent"));
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        await familyReadiness.setFamilyRequirement({data: {
          applicationId: application.applicationId, requirementId: review.id, complete: true,
        }});
        state.actor = guardianActor;
        const checklist = await familyChecklist.getGuardianEnrollmentChecklist({
          data: {applicationId: application.applicationId},
        });
        const configured = first(checklist.requirements.filter(x=>x.id===form.id));
        if (!configured.form) throw new Error("School consent form was not configured");
        const signatureId = crypto.randomUUID();
        const signatureInput = {
          applicationId: application.applicationId, requirementId: form.id,
          requestId: signatureId, formRevision: configured.form.revision,
          answers: {contact_plan: "Email the family guardian after school."},
          signerName: "FullFlow Family Guardian", confirmed: true as const,
        };
        state.actor = unrelatedActor;
        await expect(familyForms.submitGuardianEnrollmentForm({data: signatureInput}))
          .rejects.toThrow();
        state.actor = guardianActor;
        await familyForms.submitGuardianEnrollmentForm({data: signatureInput});
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        await familyForms.decideEnrollmentForm({data: {
          applicationId: application.applicationId, requirementId: form.id,
          submissionId: signatureId, status: "accepted" as const,
          reason: "Synthetic consent independently reviewed by the school.",
          confirmed: true as const,
        }});
        await tx.insert(s.admissionSeatPools).values({
          programId, schoolYearId: time.schoolYear.id, capacity: 24,
        });
        const offer = await offerCommands.issueAdmissionOffer({data: {
          applicationId: application.applicationId,schoolYearId: time.schoolYear.id,
        }});
        state.actor = guardianActor;
        await offerCommands.respondToAdmissionOffer({data: {
          offerId: offer.offerId,decision: "accept",
        }});
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        const activated = await offerCommands.activateOfferedEnrollment({data: {
          offerId: offer.offerId,
        }});
        const placement = await placements.placeEnrolledStudent({data: {
          applicationId: application.applicationId, sectionId: section.id,
        }});
        expect(activated.enrollmentId).toBeTruthy();
        expect(placement).toBeTruthy();
        expect(await tx.select().from(s.enrollments).where(and(
          eq(s.enrollments.studentProfileId,profile.id),
          eq(s.enrollments.programId, programId),
          eq(s.enrollments.kind,"section"),
          eq(s.enrollments.sectionId,section.id),
          eq(s.enrollments.status,"active"),
        ))).toHaveLength(1);
        // Real Section instruction: the assigned teacher publishes work for the
        // student enrolled through the *same* admission offer above.
        const gradebook = await import("@/modules/learning/gradebook.functions");
        const assignmentCommands = await import("@/modules/student-experience/assignments.functions");
        const classroom = await import("@/modules/learning/class-workspace.functions");
        const guardianQueries = await import("@/modules/learning/guardian-academic-queries.functions");
        const teacherActor: AccessContext = {
          ...context(teacher.id, school.id, [site.id], [programId]),
          role: "teacher", capabilities: new Set(roleCapabilities.teacher),
          accountId: crypto.randomUUID(), grantId: crypto.randomUUID(),
        };
        const studentActor: AccessContext = {
          ...context(profile.personId, school.id, [site.id], [programId]),
          role: "student", capabilities: new Set(roleCapabilities.student),
          accountId: crypto.randomUUID(), grantId: crypto.randomUUID(),
        };
        state.actor = teacherActor;
        const teacherTodayService = await import("@/modules/learning/teacher-today.functions");
        const studentTodayService = await import("@/modules/student-experience/student-today.functions");
        const beforeFirstWork = first((await teacherTodayService.getTeacherToday()).sections
          .filter(item => item.id === section.id));
        expect(beforeFirstWork.classroom.ready).toBe(false);
        expect(beforeFirstWork.classroom.blockers.map(item => item.key)).toContain("missing_assessment");
        expect(beforeFirstWork.classroom.firstWeek.lesson?.id).toBe("solve-one");
        const assessment = await gradebook.createAssessment({data: {
          sectionId: section.id,
          title: "FullFlow Algebra: Explain your solution",
          instructions: "Solve 3x + 5 = 20 and justify the inverse operations.",
          assignmentKind: "classwork" as const, curriculumLessonId: "solve-one",
          pointsPossible: 10,
          dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
          publishNow: true,
        }});
        expect(assessment.status).toBe("published");
        const authorizedTeacherHandoff = first((await teacherTodayService.getTeacherToday()).sections
          .filter(item => item.id === section.id));
        expect(authorizedTeacherHandoff.classroom).toMatchObject({
          ready: true, activeStudentCount: 1,
          firstWeek: { lesson: { id: "solve-one" }, assessment: { id: assessment.assessmentId } },
        });
        state.actor = studentActor;
        const authorizedStudentHandoff = first((await studentTodayService.getMyStudentToday()).firstWeek
          .filter(item => item.sectionId === section.id));
        expect(authorizedStudentHandoff).toMatchObject({
          ready: true, activeStudentCount: 1,
          firstWeek: { lesson: { id: "solve-one" }, assessment: { id: assessment.assessmentId } },
        });
        const delivery = await classroom.getClassWorkspace({data: {sectionId: section.id}});
        expect(delivery.content?.modules.some(module=>
          module.lessons.some(lesson=>lesson.id==="solve-one"))).toBe(true);

        // Connected learning evidence stays on the SAME student, section,
        // publisher release and rollback-isolated Neon fixture. This directly
        // exercises the server commands and real DB constraints with mocked
        // actor selection. Real browser-cookie acceptance remains separate.
        const activity = await import("@/modules/learning/learning-activity.functions");
        const learningAccount = first(await tx.insert(s.accessAccounts).values({
          emailNormalized: `fullflow-learner-${suffix}@example.test`,
        }).returning());
        const learningGrant = first(await tx.insert(s.accountPersonGrants).values({
          accountId: learningAccount.id, personId: profile.personId,
          role: "student", organizationId: school.id, siteId: site.id,
          active: true,
        }).returning());
        const learningLogin = first(await tx.insert(s.accessSessions).values({
          accountId: learningAccount.id, activeGrantId: learningGrant.id,
          secretHash: `fullflow-learning-synthetic-${suffix}`,
          expiresAt: new Date(Date.now() + 60 * 60_000),
        }).returning());
        const authenticatedStudent: AccessContext = {
          ...studentActor,
          accountId: learningAccount.id, sessionId: learningLogin.id,
          grantId: learningGrant.id,
        };
        state.actor = authenticatedStudent;
        const tracking = await activity.startLearningActivitySession({data:{
          sectionId:section.id,
        }});
        expect(tracking.versionId).toBe(draft.versionId);
        const opened = {
          clientEventId:crypto.randomUUID(),sectionId:section.id,
          lessonId:"solve-one",kind:"lesson_opened" as const,
          occurredAt:new Date().toISOString(),
        };
        expect(await activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,interaction:opened,
        }})).toMatchObject({recorded:true,duplicate:false,estimatedActiveMs:0});
        expect(await activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,interaction:opened,
        }})).toMatchObject({recorded:true,duplicate:true,estimatedActiveMs:0});
        await expect(activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,
          interaction:{...opened,kind:"lesson_resumed" as const},
        }})).rejects.toThrow("Conflicting learning event retry");
        await expect(activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,
          interaction:{...opened,clientEventId:crypto.randomUUID(),
            kind:"resource_opened" as const,resourceId:"not-a-published-resource"},
        }})).rejects.toThrow("published lesson resource");
        expect(await tx.select().from(s.learningActivityEvents).where(eq(
          s.learningActivityEvents.learningSessionId,tracking.learningSessionId))).toHaveLength(1);
        const ownLearning = await activity.getLearningActivityHistory({data:{sectionId:section.id}});
        expect(ownLearning.evidence.map(e=>e.kind)).toEqual(["lesson_opened"]);
        expect((await activity.getLearningActivityHistory({data:{sectionId:section.id}})).evidence)
          .toEqual(ownLearning.evidence); // refresh/read after server-side persistence
        state.actor = teacherActor;
        expect((await activity.getLearningActivityHistory({data:{
          sectionId:section.id,studentPersonId:profile.personId,
        }})).evidence).toHaveLength(1);

        // Teacher-reviewed intervention: evidence is a referenced fact, not an
        // automated disengagement diagnosis. The ordinary Actions lifecycle
        // owns assignment, follow-up deadline, audit and resolution.
        const teacherFollowUp = await import("@/modules/learning/teacher-learning-followup.functions");
        const supportRequest = {
          sectionId: section.id, studentProfileId: profile.id,
          learningEventId: first(ownLearning.evidence).id,
          observation: "I will review this lesson with the learner and verify their next steps.",
          approach: "review_work" as const, dueInDays: 3 as const,
        };
        const support = await teacherFollowUp.createTeacherLearningFollowUp({
          data: supportRequest,
        });
        expect(support.created).toBe(true);
        expect(await teacherFollowUp.createTeacherLearningFollowUp({data:supportRequest}))
          .toEqual({actionId:support.actionId,created:false});
        const [supportAction] = await tx.select().from(s.actions)
          .where(eq(s.actions.id,support.actionId));
        expect(supportAction).toMatchObject({
          type:"academic_intervention",status:"open",
          ownerPersonId:teacher.id,sectionId:section.id,
          programId,subjectType:"student_profile",subjectId:profile.id,
          metadata:{source:"teacher_learning_follow_up",
            learningEventId:supportRequest.learningEventId,approach:"review_work",
            createdByTeacherId:teacher.id},
        });
        expect(supportAction.evidence).toHaveLength(1);
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,support.actionId),
          eq(s.auditEvents.action,"teacher.learning_follow_up.created"),
        ))).toHaveLength(1);
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId,support.actionId),
          eq(s.domainEvents.eventType,"ActionCreated"),
        ))).toHaveLength(1);
        await expect(teacherFollowUp.createTeacherLearningFollowUp({data:{
          ...supportRequest,studentProfileId:crypto.randomUUID(),
        }})).rejects.toThrow("currently enrolled student");
        state.actor = {...teacherActor,actorPersonId:outsider.id};
        await expect(teacherFollowUp.createTeacherLearningFollowUp({
          data:supportRequest,
        })).rejects.toThrow("assigned active section");
        const followThrough = await import("@/modules/learning/teacher-followup-resolution.functions");
        // Teacher role alone cannot expose a class owned by another educator.
        expect((await followThrough.getTeacherLearningFollowUps()).items).toHaveLength(0);
        state.actor = guardianActor;
        await expect(followThrough.resolveTeacherLearningFollowUp({data:{
          actionId:support.actionId,
          supportProvided:"I checked the student's revision in class.",
          outcome:"not_yet_verified",outcomeEvidence:"A new assignment will be reviewed next week.",
        }})).rejects.toThrow("verified teacher required");
        state.actor = teacherActor;
        const teacherQueue = await followThrough.getTeacherLearningFollowUps();
        expect(teacherQueue.items.some(x=>x.id===support.actionId&&
          x.studentProfileId===profile.id&&x.sectionId===section.id)).toBe(true);
        // Student Success handoff: deliberately NEW student-facing text, not
        // the teacher's original intervention notes or learning telemetry.
        const goalService = await import("@/modules/learning/teacher-student-goal.functions");
        const approvedGoal = {
          teacherActionId: support.actionId,
          title: "Practice solving two-step equations",
          studentInstructions: "Complete two assigned examples and bring the written steps to our next math class.",
          dueInDays: 7 as const, confirmedStudentSafe: true as const,
        };
        const sharedGoal = await goalService.shareTeacherStudentGoal({data:approvedGoal});
        expect(sharedGoal.created).toBe(true);
        await expect(goalService.shareTeacherStudentGoal({data:{
          ...approvedGoal, confirmedStudentSafe: false,
        }})).rejects.toThrow();
        expect(await goalService.shareTeacherStudentGoal({data:approvedGoal}))
          .toEqual({actionId:sharedGoal.actionId,created:false});
        const [studentGoal] = await tx.select().from(s.actions)
          .where(eq(s.actions.id,sharedGoal.actionId));
        expect(studentGoal).toMatchObject({
          type:"student_learning_goal",status:"open",ownerPersonId:profile.personId,
          parentActionId:support.actionId,subjectType:"student_profile",subjectId:profile.id,
          sectionId:section.id,programId,siteId:site.id,
          title:approvedGoal.title,description:approvedGoal.studentInstructions,
          metadata:{source:"teacher_shared_learning_goal"},evidence:[],
        });
        expect(JSON.stringify(studentGoal)).not.toContain(supportRequest.observation);
        const sharedAudit = await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,sharedGoal.actionId),
          eq(s.auditEvents.action,"student.learning_goal.shared"),
        ));
        expect(sharedAudit).toHaveLength(1);
        expect(first(sharedAudit).after).toMatchObject({
          confirmedStudentSafe: true, parentActionId: support.actionId,
        });
        state.actor = {...teacherActor,actorPersonId:outsider.id};
        await expect(goalService.shareTeacherStudentGoal({data:{
          ...approvedGoal,teacherActionId:support.actionId,
        }})).rejects.toThrow("active teacher-owned academic follow-up");
        state.actor = guardianActor;
        await expect(goalService.shareTeacherStudentGoal({data:approvedGoal}))
          .rejects.toThrow("verified assigned teacher");
        state.actor = studentActor;
        const studentActions = await import("@/modules/actions/student-actions.functions");
        const visibleActions = await studentActions.getQuickWinActions();
        expect(visibleActions.actions.find(x=>x.id===sharedGoal.actionId)).toMatchObject({
          title:approvedGoal.title, description:approvedGoal.studentInstructions,
          type:"student_learning_goal",subjectId:profile.id,
        });
        expect(JSON.stringify(visibleActions.actions.find(x=>x.id===sharedGoal.actionId)))
          .not.toContain(supportRequest.observation);
        await expect(studentActions.finishQuickWinAction({data:{
          actionId:sharedGoal.actionId,
        }})).rejects.toThrow("owning workflow");
        state.actor = teacherActor;
        const resolution = {
          actionId:support.actionId,
          supportProvided:"Reviewed inverse operations with the student using a worked example.",
          outcome:"not_yet_verified" as const,
          outcomeEvidence:"Student will complete the assigned example before mastery can be assessed.",
        };
        const savedFollowUp = await followThrough.resolveTeacherLearningFollowUp({data:resolution});
        expect(savedFollowUp).toEqual({saved:true,alreadyResolved:false});
        expect(await followThrough.resolveTeacherLearningFollowUp({data:resolution}))
          .toEqual({saved:true,alreadyResolved:true});
        const [resolvedFollowUp] = await tx.select().from(s.actions)
          .where(eq(s.actions.id,support.actionId));
        expect(resolvedFollowUp.status).toBe("resolved");
        expect(resolvedFollowUp.resolutionNote).toContain("Support provided: Reviewed inverse operations");
        expect(resolvedFollowUp.metadata.followUpResult).toMatchObject({
          outcome:"not_yet_verified",supportProvided:resolution.supportProvided,
          outcomeEvidence:resolution.outcomeEvidence,
        });
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId,support.actionId),
          eq(s.domainEvents.eventType,"ActionResolved"),
        ))).toHaveLength(1);
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,support.actionId),
          eq(s.auditEvents.action,"action.resolve"),
        ))).toHaveLength(1);
        expect((await followThrough.getTeacherLearningFollowUps()).items
          .find(x=>x.id===support.actionId)?.status).toBe("resolved");

        state.actor = guardianActor;
        expect((await activity.getLearningActivityHistory({data:{
          sectionId:section.id,studentPersonId:profile.personId,
        }})).evidence).toHaveLength(1);
        state.actor = unrelatedActor;
        await expect(activity.getLearningActivityHistory({data:{
          sectionId:section.id,studentPersonId:profile.personId,
        }})).rejects.toThrow("guardian academic relationship");
        state.actor = {
          ...teacherActor,actorPersonId:outsider.id,
        };
        await expect(activity.getLearningActivityHistory({data:{
          sectionId:section.id,studentPersonId:profile.personId,
        }})).rejects.toThrow("assigned teacher");
        state.actor = {
          ...authenticatedStudent,sessionId:crypto.randomUUID(),
        };
        await expect(activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,
          interaction:{...opened,clientEventId:crypto.randomUUID()},
        }})).rejects.toThrow("active learner login session");
        await tx.update(s.accessSessions).set({revokedAt:new Date()})
          .where(eq(s.accessSessions.id,learningLogin.id));
        state.actor = authenticatedStudent;
        await expect(activity.recordLearningInteraction({data:{
          learningSessionId:tracking.learningSessionId,
          interaction:{...opened,clientEventId:crypto.randomUUID()},
        }})).rejects.toThrow("active learner login session");
        await expect(activity.startLearningActivitySession({data:{
          sectionId:section.id,
        }})).rejects.toThrow("active learner login session");
        expect(await tx.select().from(s.learningActivityEvents).where(eq(
          s.learningActivityEvents.learningSessionId,tracking.learningSessionId))).toHaveLength(1);
        state.actor = studentActor;

        await classroom.setLessonCompletion({data: {
          sectionId: section.id, versionId: draft.versionId,
          lessonId: "solve-one", completed: true,
        }});
        const assignedWork = await assignmentCommands.getAssignments();
        expect(assignedWork.assignments.some(x=>
          x.assessmentId===assessment.assessmentId)).toBe(true);
        const submission = await assignmentCommands.saveAssignmentResponse({data: {
          assessmentId: assessment.assessmentId,
          text: "Subtract five: 3x = 15. Divide by three: x = 5; 3(5)+5=20.",
        }});
        const submitted = first(await tx.select().from(s.submissions)
          .where(eq(s.submissions.id,submission.submissionId)));
        expect(submitted).toMatchObject({
          assessmentId: assessment.assessmentId,
          studentProfileId: profile.id, status: "submitted",
        });
        state.actor = teacherActor;
        await gradebook.gradeSubmission({data: {
          submissionId: submission.submissionId, score: 9,
          feedbackComment: "Correct inverse operations and a verified substitution.",
        }});
        const graded = first(await tx.select().from(s.submissions)
          .where(eq(s.submissions.id,submission.submissionId)));
        expect(graded.status).toBe("graded");
        expect(Number(graded.score)).toBe(9);

        // Teacher reviews the separately student-visible goal against the
        // actual SAME student/section/AFTER-goal graded assessment, even if
        // the private teacher intervention has already been resolved.
        const goalReview = await import("@/modules/learning/student-goal-review.functions");
        const eligibleGoalWork = await goalReview.getStudentGoalGradedEvidence({data:{
          goalActionId:sharedGoal.actionId,
        }});
        expect(eligibleGoalWork.availableEvidence.map(row=>row.submissionId))
          .toContain(submission.submissionId);
        const approvedReview = {
          goalActionId:sharedGoal.actionId,
          gradedSubmissionId:submission.submissionId,
          outcome:"met" as const,
          studentFeedback:"Your explanation of inverse operations and written verification meets the assigned practice goal.",
          confirmedStudentSafe:true as const,
        };
        state.actor = guardianActor;
        await expect(goalReview.reviewStudentLearningGoal({data:approvedReview}))
          .rejects.toThrow("assigned teacher");
        state.actor = studentActor;
        await expect(goalReview.reviewStudentLearningGoal({data:approvedReview}))
          .rejects.toThrow("assigned teacher");
        state.actor = {...teacherActor, actorPersonId:outsider.id};
        await expect(goalReview.getStudentGoalGradedEvidence({data:{
          goalActionId:sharedGoal.actionId,
        }})).rejects.toThrow("current teacher-owned goal relationship");
        state.actor = teacherActor;
        await expect(goalReview.reviewStudentLearningGoal({data:{
          ...approvedReview, gradedSubmissionId:crypto.randomUUID(),
        }})).rejects.toThrow("newly graded work");
        const reviewed = await goalReview.reviewStudentLearningGoal({data:approvedReview});
        expect(reviewed).toEqual({
          goalActionId:sharedGoal.actionId,outcome:"met",duplicate:false,
        });
        expect(await goalReview.reviewStudentLearningGoal({data:approvedReview}))
          .toEqual({goalActionId:sharedGoal.actionId,outcome:"met",duplicate:true});
        await expect(goalReview.reviewStudentLearningGoal({data:{
          ...approvedReview,outcome:"needs_more_practice",
        }})).rejects.toThrow("same graded work already reviewed");
        const [completedGoal] = await tx.select().from(s.actions)
          .where(eq(s.actions.id,sharedGoal.actionId));
        expect(completedGoal.status).toBe("resolved");
        expect(completedGoal.resolutionNote).toBe(approvedReview.studentFeedback);
        expect(completedGoal.metadata.goalReview).toMatchObject({
          submissionId:submission.submissionId,outcome:"met",
          studentFeedback:approvedReview.studentFeedback,
        });
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId,sharedGoal.actionId),
          eq(s.domainEvents.eventType,"ActionResolved"),
        ))).toHaveLength(1);
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,sharedGoal.actionId),
          eq(s.auditEvents.action,"student.learning_goal.reviewed"),
        ))).toHaveLength(1);
        state.actor = studentActor;
        const reviewedStudentAction = first((await studentActions.getQuickWinActions()).actions
          .filter(action=>action.id===sharedGoal.actionId));
        expect(reviewedStudentAction.status).toBe("resolved");
        expect(reviewedStudentAction.review).toMatchObject({
          outcome:"met",studentFeedback:approvedReview.studentFeedback,
        });
        expect(JSON.stringify(reviewedStudentAction)).not.toContain(supportRequest.observation);
        state.actor = teacherActor;
        const [postedEvent] = await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId,submission.submissionId),
          eq(s.domainEvents.eventType,"GradePosted"),
        ));
        expect(postedEvent).toBeTruthy();
        // Exercise the real outbox handler (not just the GradePosted event row).
        const events = await import("@/modules/learning/academic-event-handler");
        await events.handleGradePostedEvent(postedEvent!.id);
        const guardianGradeNotice = await tx.select().from(s.notifications).where(and(
          eq(s.notifications.recipientPersonId,guardian.id),
          eq(s.notifications.resourceId,submission.submissionId),
          eq(s.notifications.type,"grade_posted"),
        ));
        expect(guardianGradeNotice).toHaveLength(1);

        state.actor = guardianActor;
        const notices = await import("@/modules/communication/notification-center.functions");
        const gradeNotice = (await notices.getNotifications()).find(
          note=>note.id===guardianGradeNotice[0]!.id);
        expect(gradeNotice?.href).toContain(encodeURIComponent(assessment.assessmentId));
        const parentProgress = await guardianQueries.getGuardianAssignments({data:{
          studentPersonId: profile.personId,
        }});
        const parentItem = first(parentProgress.assignments.filter(x=>
          x.assessmentId===assessment.assessmentId));
        expect(parentItem.status).toBe("graded");
        expect(Number(parentItem.score)).toBe(9);
        expect(parentItem.sectionId).toBe(section.id);
        // Guardian can respond to the released grade; the school gets an
        // actual operations Action, resolves it, and the related guardian can
        // read the resolution while a different guardian cannot.
        const gradeResponses = await import("@/modules/learning/guardian-grade-response.functions");
        const question = {submissionId: submission.submissionId,
          message: "Please explain how the written solution was assessed."};
        const responseRequest = await gradeResponses.requestGuardianGradeResponse({data:question});
        expect(responseRequest.created).toBe(true);
        expect(await gradeResponses.requestGuardianGradeResponse({data:question}))
          .toMatchObject({created:false,actionId:responseRequest.actionId});
        expect((await gradeResponses.getGuardianGradeResponse({data:{
          submissionId:submission.submissionId,
        }})).response?.status).toBe("open");
        state.actor = unrelatedActor;
        await expect(gradeResponses.getGuardianGradeResponse({data:{
          submissionId:submission.submissionId,
        }})).rejects.toThrow();
        await expect(guardianQueries.getGuardianAssignments({data:{
          studentPersonId: profile.personId,
        }})).rejects.toThrow("guardian academic relationship");
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        const schoolActions = await import("@/modules/operations/action-workspace.functions");
        const queue = await schoolActions.getOperationsActions({data:{siteId:site.id,programId}});
        expect(queue.items.some(item=>item.id===responseRequest.actionId)).toBe(true);
        const deadline=new Date(Date.now()+86400000).toISOString();
        await schoolActions.assignOperationsAction({data:{
          id:responseRequest.actionId,ownerPersonId:schoolOperator.id,priority:"high",
        }});
        await schoolActions.setOperationsActionDeadline({data:{
          id:responseRequest.actionId,dueAt:deadline,
          reason:"School will review the guardian question within one day.",
        }});
        const [scheduledResponse]=await tx.select().from(s.actions)
          .where(eq(s.actions.id,responseRequest.actionId));
        expect(scheduledResponse.ownerPersonId).toBe(schoolOperator.id);
        expect(scheduledResponse.dueAt?.toISOString()).toBe(deadline);
        expect((await schoolActions.getOperationsActions({data:{siteId:site.id,programId}}))
          .summary.overdue).toBe(0);
        const resolutionNote = "The solution was correct; one point was deducted for incomplete explanation.";
        await schoolActions.updateOperationsAction({data:{
          id:responseRequest.actionId,status:"resolved",resolutionNote,
        }});
        const [parentNotice] = await tx.select().from(s.notifications).where(and(
          eq(s.notifications.recipientPersonId,guardian.id),
          eq(s.notifications.type,"guardian_grade_follow_up_resolved"),
          eq(s.notifications.resourceId,responseRequest.actionId),
        ));
        expect(parentNotice).toBeTruthy();
        const firstResponse=first(await tx.select().from(s.actions)
          .where(eq(s.actions.id,responseRequest.actionId)));
        // Network retries must not send a second guardian resolution or create
        // another action. A resolved record is immutable for this transition.
        await schoolActions.updateOperationsAction({data:{
          id:responseRequest.actionId,status:"resolved",resolutionNote,
        }});
        expect(await tx.select().from(s.notifications).where(and(
          eq(s.notifications.recipientPersonId,guardian.id),
          eq(s.notifications.type,"guardian_grade_follow_up_resolved"),
          eq(s.notifications.resourceId,responseRequest.actionId),
        ))).toHaveLength(1);

        await expect(schoolActions.updateOperationsAction({data:{
          id:responseRequest.actionId,status:"resolved",resolutionNote:"A different answer on a closed response.",
        }})).rejects.toThrow("Action is closed");
        await expect(schoolActions.updateOperationsAction({data:{
          id:responseRequest.actionId,status:"in_progress",
        }})).rejects.toThrow("Action is closed");
        state.actor={...state.actor!,scope:{...state.actor!.scope,programIds:[]}};
        await expect(schoolActions.updateOperationsAction({data:{
          id:responseRequest.actionId,status:"resolved",resolutionNote,
        }})).rejects.toThrow("action program scope");
        state.actor=context(schoolOperator.id,school.id,[site.id],[programId]);
        const resolvedResponse=first(await tx.select().from(s.actions)
          .where(eq(s.actions.id,responseRequest.actionId)));
        expect(resolvedResponse.resolvedAt).toEqual(firstResponse.resolvedAt);
        expect(resolvedResponse.updatedAt).toEqual(firstResponse.updatedAt);
        expect(resolvedResponse.resolutionNote).toBe(resolutionNote);
        expect(await tx.select().from(s.domainEvents).where(and(
          eq(s.domainEvents.aggregateId,responseRequest.actionId),
          eq(s.domainEvents.eventType,"ActionResolved"),
        ))).toHaveLength(1);
        expect(await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,responseRequest.actionId),
          eq(s.auditEvents.action,"action.status.change"),
        ))).toHaveLength(1);

        const snapshotApi = await import("@/modules/operations/command-center.functions");
        const live = await snapshotApi.getLiveFullFlowOperations({data:{
          siteId:site.id,programId,
        }});
        const programRow = first(live.programs);
        expect(programRow.id).toBe(programId);
        expect(programRow.counts).toMatchObject({
          adoptedCurriculumPacks:1,sections:1,publishedSections:1,
          staffedSections:1,applications:1,activeProgramStudents:1,
          placedStudents:1,publishedAssessments:1,gradedWork:1,
          unresolvedGuardianResponses:0,
        });
        state.actor = guardianActor;
        const answer = await gradeResponses.getGuardianGradeResponse({data:{
          submissionId:submission.submissionId,
        }});
        expect(answer.response).toMatchObject({
          id:responseRequest.actionId,status:"resolved",resolutionNote,
        });
        await tx.update(s.guardianRelationships).set({canViewAcademics:false})
          .where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
        await expect(gradeResponses.getGuardianGradeResponse({data:{
          submissionId:submission.submissionId,
        }})).rejects.toThrow();
        await tx.update(s.guardianRelationships).set({canViewAcademics:true})
          .where(eq(s.guardianRelationships.guardianPersonId,guardian.id));
        const resolvedNotice=(await notices.getNotifications()).find(
          item=>item.id===parentNotice!.id);
        expect(resolvedNotice?.href).toContain(encodeURIComponent(profile.personId));
        state.actor = {...context(publisherPerson.id,publisherOrg.id,
          [publisherSite.id],[publisherProgram.id])};
        await expect(snapshotApi.getLiveFullFlowOperations({data:{
          siteId: site.id, programId,
        }})).rejects.toThrow();
        state.actor = context(schoolOperator.id,school.id,[site.id],[programId]);
        expect((await snapshotApi.getLiveFullFlowOperations({data:{
          siteId:site.id,programId,
        }})).programs.map(p=>p.id)).toEqual([programId]);



        // One operational record means the actual newly created school
        // Program and its relational children are identical across domains.
        state.actor = context(schoolOperator.id, school.id, [site.id], [programId]);
        const operational = await sections.getLaunchAcademicSetup({data:{programId}});
        expect(operational.program.id).toBe(programId);
        expect(operational.sections.some(x=>x.id===section.id)).toBe(true);
        expect(first(operational.sections.filter(item => item.id === section.id)).classroom.ready).toBe(true);
        expect(first(operational.catalog.filter(item => item.versionId === draft.versionId)).recommendation)
          .toMatchObject({ available: true, licensed: true, adopted: true, instructionReady: true, recommended: true });
        const admissions = await (await import(
          "@/modules/enrollment/admissions-dashboard.functions")).getAdmissionsDashboard({
          data: {programId,siteId:site.id},
        });
        expect(admissions).toBeTruthy();
        const relation = first(await tx.select({
          programId: s.programs.id, sectionId: s.sections.id,
          studentProfileId: s.enrollments.studentProfileId,
          assessmentId: s.assessments.id, submissionId: s.submissions.id,
        }).from(s.programs)
          .innerJoin(s.sections,eq(s.sections.programId,s.programs.id))
          .innerJoin(s.enrollments,and(
            eq(s.enrollments.sectionId,s.sections.id),
            eq(s.enrollments.kind,"section")))
          .innerJoin(s.assessments,eq(s.assessments.sectionId,s.sections.id))
          .innerJoin(s.submissions,and(
            eq(s.submissions.assessmentId,s.assessments.id),
            eq(s.submissions.studentProfileId,s.enrollments.studentProfileId)))
          .where(and(eq(s.programs.id,programId),
            eq(s.sections.id,section.id),eq(s.enrollments.studentProfileId,profile.id),
            eq(s.submissions.id,submission.submissionId))));
        expect(relation).toEqual({
          programId, sectionId: section.id, studentProfileId:profile.id,
          assessmentId:assessment.assessmentId, submissionId:submission.submissionId,
        });
        ids = {programId, siteId: site.id, sectionId: section.id, versionId: draft.versionId};
        completed = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined; state.actor = undefined;
    }
    expect(completed).toBe(true);
    // This acceptance stage is rollback-isolated; it does not create a demo
    // that misleadingly starts life with a fabricated enrollment or grade.
    const persisted = await realDb.select({id: s.programs.id}).from(s.programs)
      .where(eq(s.programs.id, ids!.programId));
    expect(persisted).toHaveLength(0);
  }, 600_000);
});
