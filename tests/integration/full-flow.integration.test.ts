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
const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("FullFlow: one school, same high-school program through curriculum adoption", () => {
  it("creates its site/program, adopts a separately published course and provisions that exact program section", async () => {
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
          code: `FF-ALG-${suffix}`, title: "Algebra I",
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
  }, 120_000);
});
