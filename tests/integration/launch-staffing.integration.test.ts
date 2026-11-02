import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { roleCapabilities, type AccessContext } from "@/domain/access-context";
import type { Actor } from "@/modules/identity/actors.server";
import { enablePublishedPolicyInRollback } from "./helpers/published-policy";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({
  tx: undefined as Transaction | undefined, actor: undefined as AccessContext | undefined,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (value: unknown) => value,
    validator(parse: (value: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input?: { data: unknown }) => callback({ data: this.parse(input?.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"), setResponseHeader: vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server", () => ({
  getCommandContext: async () => { if (!state.actor) throw new Error("Missing launch test actor"); return state.actor; },
}));
vi.mock("@/db/client", () => ({
  get db() { if (!state.tx) throw new Error("Launch tests must stay in the rollback transaction"); return state.tx; },
}));
vi.mock("@/platform/storage/r2", () => ({
  createPrivateUploadUrl: vi.fn(() => "https://private.example/upload"),
  verifyPrivateObject: vi.fn(),
  signPrivateObjectUrl: vi.fn(() => "https://private.example/evidence"),
}));

function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("Missing launch staffing fixture");
  return row;
}
const integration = process.env.DATABASE_URL ? describe : describe.skip;
integration("registrar staffing to launch handoff", () => {
  beforeEach(()=>{vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2027-08-01T12:00:00Z"));});
  afterEach(()=>vi.useRealTimers());
  it("publishes requirements, enforces reviewed term-wide eligibility, exposes teacher classes and gates opening", async () => {
    vi.stubEnv("CAN_R2_QUALIFICATION_UPLOADS_ENABLED","true");
    const { db: database } = await vi.importActual<{ db: Database }>("@/db/client");
    const s = await import("@/db/schema");
    const launch = await import("@/modules/programs/launch-academics.functions");
    const catalog = await import("@/modules/profiles/qualification-catalog.functions");
    const policyRevisions = await import("@/modules/programs/teacher-policy.functions");
    const { activateProgram } = await import("@/modules/programs/program-launch-service");
    const credentials = await import("@/modules/profiles/qualifications.functions");
    const storage = await import("@/platform/storage/r2");
    const { evaluateLaunchTeacher, evaluateLaunchStaffing } = await import("@/modules/staffing/launch-staffing.server");
    const { accessibleClasses, authorizeClass } = await import("@/modules/learning/class-access.server");
    const { getSiteToday } = await import("@/modules/operations/site-today.functions");
    const { activateLaunch,listLaunches }=await import("@/modules/programs/launch.functions");
    const { acknowledgeLaunchHandoff,transferLaunchHandoff }=await import("@/modules/programs/opening-handoff.functions");
    const { updateOperationsAction,assignOperationsAction,getOperationsActions }=await import("@/modules/operations/action-workspace.functions");
    const { getNotifications }=await import("@/modules/communication/notification-center.functions");
    const rollback = new Error("rollback-launch-staffing");
    const suffix = crypto.randomUUID().slice(0, 8);
    const beforeEnum = await database.execute(sql`select enumlabel from pg_enum
      where enumtypid = 'compliance_framework_version_status'::regtype order by enumsortorder`);
    let teacherId = "";
    let programId = "";
    let definitionKey = "";
    let revisionVersionId = "";
    let handoffActionId = "";
    let checked = false;
    try {
      await database.transaction(async tx => {
        state.tx = tx;
        await enablePublishedPolicyInRollback(tx);
        const org = first(await tx.insert(s.organizations).values({
          type: "christian_school", name: "Launch Handoff Test", slug: `launch-handoff-${suffix}`,
        }).returning());
        const site = first(await tx.insert(s.sites).values({
          organizationId: org.id, name: "Launch Site", slug: `launch-handoff-${suffix}`,
        }).returning());
        const otherSite = first(await tx.insert(s.sites).values({
          organizationId: org.id, name: "Other Launch Site", slug: `other-launch-${suffix}`,
        }).returning());
        const jurisdiction = first(await tx.insert(s.jurisdictions).values({
          code: `launch-handoff-${suffix}`, name: "Synthetic launch jurisdiction",
        }).returning());
        const program = first(await tx.insert(s.programs).values({
          organizationId: org.id, siteId: site.id, jurisdictionId: jurisdiction.id,
          type: "high_school_extension", status: "launching", name: "Launch Program",
          slug: `launch-handoff-${suffix}`, gradeRange: { min: "9", max: "12" },
          deliveryModel: { onsite: true }, hostOrganizationId: org.id,
          academicProviderOrganizationId: org.id, creditIssuingOrganizationId: org.id,
        }).returning());
        programId = program.id;
        const [teacher, registrar, coTeacher, outsider, receiver] = await tx.insert(s.people).values([
          { legalFirstName: "Synthetic", legalLastName: "LaunchTeacher" },
          { legalFirstName: "Synthetic", legalLastName: "LaunchRegistrar" },
          { legalFirstName: "Synthetic", legalLastName: "LaunchCoTeacher" },
          { legalFirstName: "Synthetic", legalLastName: "LaunchOutsider" },
          { legalFirstName: "Synthetic", legalLastName: "ReceivingOperator" },
        ]).returning();
        if (!teacher || !registrar || !coTeacher || !outsider || !receiver) throw new Error("Missing launch actors");
        const receiverAccount=first(await tx.insert(s.accessAccounts).values({
          emailNormalized:`handoff-receiver-${suffix}@example.com`,
        }).returning());
        const receiverGrant=first(await tx.insert(s.accountPersonGrants).values({
          accountId:receiverAccount.id,personId:receiver.id,organizationId:org.id,siteId:site.id,role:"registrar",
        }).returning());
        // Use the same usable teacher identity required by placement.
        for (const person of [teacher, coTeacher, outsider]) {
          const account=first(await tx.insert(s.accessAccounts).values({
            emailNormalized:"launch-teacher-"+person.id+"@example.com",
            emailVerifiedAt:new Date(),
          }).returning());
          await tx.insert(s.accountPersonGrants).values({
            accountId:account.id,personId:person.id,organizationId:org.id,
            siteId:person.id===outsider.id?otherSite.id:site.id,
            role:"teacher",active:true,});
        }
        teacherId = teacher.id;
        await tx.insert(s.memberships).values([teacher, registrar, coTeacher, outsider].map(person => ({
          organizationId: org.id, personId: person.id,
        })));
        await tx.insert(s.roleAssignments).values([
          { personId: teacher.id, organizationId: org.id, siteId: site.id, programId: program.id, roleKey: "teacher" },
          { personId: coTeacher.id, organizationId: org.id, siteId: site.id, programId: program.id, roleKey: "teacher" },
          { personId: outsider.id, organizationId: org.id, siteId: otherSite.id, roleKey: "teacher" },
          { personId: registrar.id, organizationId: org.id, roleKey: "registrar", capabilities: ["profiles.credentials.verify"] },
        ]);
        const { createAcademicTimeFixture } = await import("./helpers/academic-time");
        const time = await createAcademicTimeFixture({ organizationId: org.id, siteId: site.id, programId: program.id, suffix });
        const template = first(await tx.insert(s.courseTemplates).values({
          owningOrganizationId: org.id, code: `launch-${suffix}`, title: "Launch Science", subject: "Science",
        }).returning());
        const version = first(await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId: template.id, version: 1, status: "published",
        }).returning());
        const journeyDefinition = first(await tx.insert(s.journeyDefinitions).values({
          key: `launch-handoff-${suffix}`, version: "1", audience: "program", title: "Synthetic launch",
        }).returning());
        const journey = first(await tx.insert(s.journeys).values({
          type: "program_launch", participantType: "program", participantId: program.id, status: "ready",
          programId: program.id, siteId: site.id, organizationId: org.id,
          journeyDefinitionId: journeyDefinition.id, definitionVersion: "1",
        }).returning());
        function act(role: string, personId: string): Actor {
          const actor: Actor = {
            role, actorPersonId: personId, accountId: crypto.randomUUID(), sessionId: crypto.randomUUID(),
            grantId: crypto.randomUUID(), capabilities: new Set(roleCapabilities[role] ?? []),
            scope: { organizationIds: [org.id], siteIds: [site.id], programIds: [program.id] },
          };
          state.actor = actor;
          return actor;
        }
        const registrarActor = act("registrar", registrar.id);
        const catalogInput={programId:program.id,key:`launch-license-${suffix}`,kind:"license",
          title:"Synthetic teaching license",reason:"New synthetic catalog entry for cross-role launch acceptance",
          confirmed:true as const};
        definitionKey=catalogInput.key;
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canAuthorCatalog).toBe(false);
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("explicit qualification catalog steward");
        const stewardRole=first(await tx.select().from(s.roleAssignments).where(and(
          eq(s.roleAssignments.personId,registrar.id),eq(s.roleAssignments.roleKey,"registrar"))));
        const stewardCapabilities=["profiles.credentials.verify","profiles.catalog.create"];
        await tx.update(s.roleAssignments).set({capabilities:stewardCapabilities,siteId:otherSite.id})
          .where(eq(s.roleAssignments.id,stewardRole.id));
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("explicit qualification catalog steward");
        await tx.update(s.roleAssignments).set({siteId:site.id}).where(eq(s.roleAssignments.id,stewardRole.id));
        const stewardMembership=first(await tx.select().from(s.memberships).where(and(
          eq(s.memberships.personId,registrar.id),eq(s.memberships.organizationId,org.id))));
        await tx.delete(s.memberships).where(eq(s.memberships.id,stewardMembership.id));
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("explicit qualification catalog steward");
        await tx.insert(s.memberships).values(stewardMembership);
        state.actor={...registrarActor,capabilities:new Set(["program.launch.start","staffing.policy.publish"])};
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("profiles.catalog.create");
        act("teacher",teacher.id);
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("role:");
        state.actor={...registrarActor,scope:{...registrarActor.scope,programIds:[]}};
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("explicit qualification catalog steward");
        state.actor=registrarActor;
        await expect(catalog.createQualificationCatalogEntry({data:{...catalogInput,confirmed:false}})).rejects.toThrow();
        await expect(catalog.createQualificationCatalogEntry({data:{...catalogInput,key:"Invalid Key"}})).rejects.toThrow();
        await expect(catalog.createQualificationCatalogEntry({data:{...catalogInput,attributesSchema:{injected:true}}})).rejects.toThrow();
        expect(await tx.select().from(s.qualificationDefinitions).where(eq(s.qualificationDefinitions.key,catalogInput.key))).toEqual([]);
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canAuthorCatalog).toBe(true);
        const createdDefinition=await catalog.createQualificationCatalogEntry({data:catalogInput});
        expect(createdDefinition.created).toBe(true);
        expect(await catalog.createQualificationCatalogEntry({data:catalogInput})).toEqual({
          definitionId:createdDefinition.definitionId,created:false});
        await expect(catalog.createQualificationCatalogEntry({data:{...catalogInput,title:"Conflicting title"}}))
          .rejects.toThrow("different definition");
        await expect(catalog.createQualificationCatalogEntry({data:{...catalogInput,kind:"clearance"}}))
          .rejects.toThrow("different definition");
        const definition=first(await tx.select().from(s.qualificationDefinitions)
          .where(eq(s.qualificationDefinitions.id,createdDefinition.definitionId)));
        expect(definition.title).toBe(catalogInput.title);
        expect(definition.kind).toBe(catalogInput.kind);
        expect(definition.attributesSchema).toEqual({});
        expect(definition.schemaVersion).toBe(1);
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify"]})
          .where(eq(s.roleAssignments.id,stewardRole.id));
        await expect(catalog.createQualificationCatalogEntry({data:catalogInput})).rejects.toThrow("explicit qualification catalog steward");
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canAuthorCatalog).toBe(false);
        const catalogAudits=await tx.select().from(s.auditEvents).where(and(
          eq(s.auditEvents.resourceId,definition.id),eq(s.auditEvents.action,"qualification.catalog_created")));
        expect(catalogAudits).toHaveLength(1);
        expect(first(catalogAudits).after).toMatchObject({key:catalogInput.key,sharedCatalog:true,confirmed:true,reason:catalogInput.reason});
        expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,definition.id),
          eq(s.domainEvents.eventType,"QualificationDefinitionCreated")))).toHaveLength(1);
        expect(await tx.select().from(s.compliancePolicyApplicability).where(eq(s.compliancePolicyApplicability.programId,program.id))).toEqual([]);
        expect(await tx.select().from(s.qualificationClaims).where(eq(s.qualificationClaims.definitionId,definition.id))).toEqual([]);
        const provision = { programId: program.id, termId: time.term.id,
          courseTemplateVersionId: version.id, code: `SCI-${suffix}`, title: "Launch Science" };
        const section = await launch.provisionLaunchSection({ data: provision });
        const assignment = { programId: program.id, sectionId: section.sectionId, teacherPersonId: teacher.id };
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("policy not configured");
        await expect(activateProgram(registrarActor, program.id)).rejects.toThrow("No assigned instructor");
        expect(await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId, section.sectionId))).toEqual([]);
        const policy = { programId: program.id, qualificationKeys: [definition.key], confirmed: true as const };
        act("teacher", teacher.id);
        await expect(launch.publishLaunchTeacherPolicy({ data: policy })).rejects.toThrow("role:");
        state.actor = { ...registrarActor, capabilities: new Set(["program.launch.start"]) };
        await expect(launch.publishLaunchTeacherPolicy({ data: policy })).rejects.toThrow("staffing.policy.publish");
        state.actor = registrarActor;
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canPublishTeacherPolicy).toBe(false);
        await expect(launch.publishLaunchTeacherPolicy({data:policy}))
          .rejects.toThrow("explicit staffing policy publisher");
        expect(await tx.select().from(s.complianceFrameworks)
          .where(eq(s.complianceFrameworks.key,"launch-teacher:"+program.id))).toHaveLength(0);
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify","staffing.policy.publish"]})
          .where(eq(s.roleAssignments.id,stewardRole.id));
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canPublishTeacherPolicy).toBe(true);
        await expect(launch.publishLaunchTeacherPolicy({ data: { ...policy, qualificationKeys: ["unknown"] } })).rejects.toThrow("catalog");
        const published = await launch.publishLaunchTeacherPolicy({ data: policy });
        await expect(launch.publishLaunchTeacherPolicy({ data: policy })).rejects.toThrow("already has");
        await tx.update(s.complianceFrameworkVersions).set({ status: "draft" }).where(eq(s.complianceFrameworkVersions.id, published.versionId));
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("policy not configured");
        await tx.update(s.complianceFrameworkVersions).set({ status: "published" }).where(eq(s.complianceFrameworkVersions.id, published.versionId));
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("No current verified credential");
        await expect(launch.assignLaunchTeacher({ data: { ...assignment, teacherPersonId: outsider.id } })).rejects.toThrow("provider-owned teacher role");

        async function verifiedClaim(personId: string, definitionId = definition.id, issuedAt = "2027-01-01T00:00:00.000Z") {
          act("teacher", personId);
          const claimData = { definitionId, issuerName: "Synthetic License Board",
            issuedAt, expiresAt: "2028-01-01T00:00:00.000Z",
            mimeType: "application/pdf" as const, size: 128, fileName: "synthetic-license.pdf" };
          const started = await credentials.beginQualificationUpload({ data: claimData });
          expect(started.uploadUrl).toBe("https://private.example/upload");
          expect(started.uploadHeaders).toEqual({"Content-Type":"application/pdf","If-None-Match":"*"});
          const submitted = await credentials.finishQualificationUpload({ data: { key: started.key, claim: claimData } });
          expect(submitted.created).toBe(true);
          expect(await credentials.finishQualificationUpload({ data: { key: started.key, claim: claimData } }))
            .toEqual({ claimId: submitted.claimId, created: false });
          await expect(credentials.finishQualificationUpload({ data: {
            key: started.key, claim: { ...claimData, issuerName: "Changed on retry" },
          } })).rejects.toThrow("different qualification details");
          const own = await credentials.getQualifications({ data: {} });
          expect(own.canSubmit).toBe(true);
          expect(own.claims.find(claim => claim.id === submitted.claimId)?.status).toBe("pending");
          expect(own.claims.find(claim => claim.id === submitted.claimId)?.sequence).toBe(1);
          await expect(credentials.getQualifications({ data: { personId: outsider.id } })).rejects.toThrow("review program");
          state.actor = registrarActor;
          const selection = { personId, programId: program.id, claimId: submitted.claimId };
          expect(await credentials.getQualificationEvidence({ data: selection })).toEqual({ url: "https://private.example/evidence" });
          expect(await credentials.decideQualification({ data: { ...selection, expectedSequence: 1,
            decision: "approve", reason: "Independently checked synthetic license" } })).toMatchObject({ status: "verified" });
          await expect(credentials.decideQualification({ data: { ...selection, expectedSequence: 1,
            decision: "approve", reason: "Stale repeat of earlier decision" } })).rejects.toThrow("review changed");
          return first(await tx.select().from(s.qualificationClaims).where(eq(s.qualificationClaims.id, submitted.claimId)));
        }
        const claim = await verifiedClaim(teacher.id);
        const reviewSelection = { personId: teacher.id, programId: program.id, claimId: claim.id };
        const reviewerWorkspace=await credentials.getQualifications({data:reviewSelection});
        expect(reviewerWorkspace.canReview).toBe(true);
        expect(JSON.stringify(reviewerWorkspace)).not.toContain("storageKey");
        expect(JSON.stringify(reviewerWorkspace)).not.toContain("storageProvider");
        const [reviewRole]=await tx.select().from(s.roleAssignments).where(and(
          eq(s.roleAssignments.personId,registrar.id),eq(s.roleAssignments.roleKey,"registrar")));
        if(!reviewRole)throw new Error("Missing reviewer grant");
        await tx.update(s.roleAssignments).set({capabilities:[]}).where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(credentials.getQualifications({data:reviewSelection})).rejects.toThrow("reviewer scope");
        await expect(credentials.getQualificationEvidence({data:reviewSelection})).rejects.toThrow("reviewer scope");
        await expect(credentials.decideQualification({data:{...reviewSelection,expectedSequence:2,
          decision:"revoke",reason:"Cannot review without explicit grant"}})).rejects.toThrow("reviewer scope");
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify"]}).where(eq(s.roleAssignments.id,reviewRole.id));
        act("teacher",teacher.id);
        await expect(credentials.decideQualification({data:{...reviewSelection,expectedSequence:2,
          decision:"revoke",reason:"Self review is not permitted"}})).rejects.toThrow("role:");
        const invalidUpload={definitionId:definition.id,issuerName:"Synthetic Board",mimeType:"application/pdf" as const,
          fileName:"evidence.pdf",size:128};
        vi.stubEnv("CAN_R2_QUALIFICATION_UPLOADS_ENABLED","false");
        await expect(credentials.beginQualificationUpload({data:invalidUpload})).rejects.toThrow("not enabled");
        vi.stubEnv("CAN_R2_QUALIFICATION_UPLOADS_ENABLED","true");
        await expect(credentials.beginQualificationUpload({data:{...invalidUpload,size:10*1024*1024+1}})).rejects.toThrow();
        await expect(credentials.beginQualificationUpload({data:{...invalidUpload,expiresAt:"2000-01-01T00:00:00Z"}})).rejects.toThrow("expired");
        const failedUpload=await credentials.beginQualificationUpload({data:invalidUpload});
        vi.mocked(storage.verifyPrivateObject).mockRejectedValueOnce(new Error("Synthetic storage verification failure"));
        await expect(credentials.finishQualificationUpload({data:{key:failedUpload.key,claim:invalidUpload}}))
          .rejects.toThrow("storage verification failure");
        expect(await tx.select().from(s.qualificationClaims).where(eq(s.qualificationClaims.id,failedUpload.key.split("/")[2]!))).toEqual([]);
        expect(await tx.select().from(s.documents).where(eq(s.documents.storageKey,failedUpload.key))).toEqual([]);
        await expect(credentials.finishQualificationUpload({data:{
          key:`qualifications/${outsider.id}/${crypto.randomUUID()}`,claim:invalidUpload}})).rejects.toThrow("own qualification");
        await expect(credentials.getQualificationEvidence({data:{claimId:crypto.randomUUID()}})).rejects.toThrow("claim owner");
        state.actor=registrarActor;
        const rejectedUpload=await (async()=>{
          act("teacher",teacher.id);
          const started=await credentials.beginQualificationUpload({data:invalidUpload});
          const submitted=await credentials.finishQualificationUpload({data:{key:started.key,claim:invalidUpload}});
          state.actor=registrarActor;
          return submitted;
        })();
        const rejectSelection={...reviewSelection,claimId:rejectedUpload.claimId};
        const [rejectedEvidence]=await tx.select().from(s.documents).where(eq(s.documents.storageKey,
          `qualifications/${teacher.id}/${rejectedUpload.claimId}`));
        if(!rejectedEvidence)throw new Error("Missing rejection evidence");
        await tx.update(s.documents).set({verifiedAt:null}).where(eq(s.documents.id,rejectedEvidence.id));
        await expect(credentials.decideQualification({data:{...rejectSelection,decision:"approve",expectedSequence:1,
          reason:"Unverified storage cannot be approved"}})).rejects.toThrow("Verified private qualification evidence");
        await credentials.decideQualification({data:{...rejectSelection,decision:"reject",expectedSequence:1,
          reason:"Synthetic mismatching credential evidence"}});
        expect((await credentials.getQualifications({data:reviewSelection})).claims
          .find(row=>row.id===rejectedUpload.claimId)?.status).toBe("rejected");
        expect((await evaluateLaunchTeacher(section.sectionId, teacher.id, tx)).eligible).toBe(true);
        await tx.update(s.qualificationClaims).set({ expiresAt: new Date("2027-10-01") }).where(eq(s.qualificationClaims.id, claim.id));
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("No current verified credential");
        await tx.update(s.qualificationClaims).set({ expiresAt: new Date("2028-01-01") }).where(eq(s.qualificationClaims.id, claim.id));
        const teacherActor = act("teacher", teacher.id);
        expect(await accessibleClasses(teacherActor)).toEqual([]);
        await expect(authorizeClass(teacherActor, section.sectionId)).rejects.toThrow("assigned teacher");
        state.actor = registrarActor;
        expect(await launch.assignLaunchTeacher({ data: assignment })).toEqual({ created: true });
        expect(await launch.assignLaunchTeacher({ data: assignment })).toEqual({ created: false });
        const {verifiedTeacherSectionIds}=await import("@/modules/enrollment/verified-section-teachers.server");
        const [teacherAccess]=await tx.select({accountId:s.accountPersonGrants.accountId})
          .from(s.accountPersonGrants).where(eq(s.accountPersonGrants.personId,teacher.id)).limit(1);
        if(!teacherAccess)throw new Error("Missing verified teacher account");
        expect(await verifiedTeacherSectionIds([section.sectionId],tx)).toContain(section.sectionId);
        await tx.update(s.accessAccounts).set({disabled:true}).where(eq(s.accessAccounts.id,teacherAccess.accountId));
        expect((await evaluateLaunchTeacher(section.sectionId,teacher.id,tx)).eligible).toBe(false);
        expect(await verifiedTeacherSectionIds([section.sectionId],tx)).not.toContain(section.sectionId);
        await tx.update(s.accessAccounts).set({disabled:false}).where(eq(s.accessAccounts.id,teacherAccess.accountId));
        expect((await evaluateLaunchTeacher(section.sectionId,teacher.id,tx)).eligible).toBe(true);
        expect(await verifiedTeacherSectionIds([section.sectionId],tx)).toContain(section.sectionId);

        expect((await accessibleClasses(teacherActor)).map(row => row.id)).toEqual([section.sectionId]);
        expect((await authorizeClass(teacherActor, section.sectionId)).section.id).toBe(section.sectionId);
        const otherActor = act("teacher", outsider.id);
        await expect(authorizeClass(otherActor, section.sectionId)).rejects.toThrow("assigned teacher");
        state.actor = registrarActor;
        state.actor = { ...registrarActor, scope: { ...registrarActor.scope, siteIds: [crypto.randomUUID()] } };
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("organization/site scope");
        state.actor = registrarActor;
        await verifiedClaim(coTeacher.id);
        await launch.assignLaunchTeacher({ data: { ...assignment, teacherPersonId: coTeacher.id } });
        expect((await tx.select().from(s.deliveryArrangements).where(and(
          eq(s.deliveryArrangements.sectionId, section.sectionId), eq(s.deliveryArrangements.status, "active"),
        ))).length).toBe(2);
        expect((await accessibleClasses(teacherActor)).map(row => row.id)).toEqual([section.sectionId]);
        const setup = await launch.getLaunchAcademicSetup({ data: { programId: program.id } });
        expect(setup.policyPublished).toBe(true);
        expect(first(setup.sections).readiness.ready).toBe(true);
        expect(first(setup.sections).candidates.find(row => row.personId === teacher.id)?.eligible).toBe(true);
        expect(first(setup.sections).candidates.some(row => row.personId === outsider.id)).toBe(false);
        const second = { ...provision, code: `SCI-B-${suffix}`, teacherPersonId: teacher.id };
        const secondSection = await launch.provisionLaunchSection({ data: second });
        expect(await launch.provisionLaunchSection({ data: second })).toEqual({ sectionId: secondSection.sectionId, created: false });
        await expect(launch.provisionLaunchSection({ data: { ...second, title: "Different class" } })).rejects.toThrow("different class");
        expect((await tx.select().from(s.deliveryArrangements).where(eq(s.deliveryArrangements.sectionId, secondSection.sectionId))).length).toBe(1);

        await tx.update(s.deliveryArrangements).set({ effectiveFrom: new Date("2027-09-01") })
          .where(eq(s.deliveryArrangements.sectionId, secondSection.sectionId));
        expect((await evaluateLaunchStaffing(secondSection.sectionId, tx)).ready).toBe(false);
        await expect(activateProgram(registrarActor, program.id)).rejects.toThrow("full instructional window");
        await tx.update(s.deliveryArrangements).set({ effectiveFrom: new Date("2027-08-16T07:00:00Z") })
          .where(eq(s.deliveryArrangements.sectionId, secondSection.sectionId));
        await credentials.decideQualification({ data: { personId: teacher.id, programId: program.id,
          claimId: claim.id, decision: "revoke", expectedSequence: 2, reason: "Synthetic revocation check" } });
        await expect(authorizeClass(teacherActor,section.sectionId)).rejects.toThrow();
        expect(await accessibleClasses(teacherActor)).toEqual([]);
        await expect(activateProgram(registrarActor, program.id)).rejects.toThrow("No current verified credential");
        await expect(launch.assignLaunchTeacher({ data: assignment })).rejects.toThrow("No current verified credential");
        await verifiedClaim(teacher.id);
        const additionalDefinition = first(await tx.insert(s.qualificationDefinitions).values({
          key: `launch-safety-${suffix}`, kind: "training", title: "Synthetic safety training",
        }).returning());
        const revision = { programId: program.id, expectedVersionId: published.versionId,
          qualificationKeys: [definition.key, additionalDefinition.key], effectiveFrom: "2027-11-01T00:00:00.000Z",
          reason: "Reviewed safety training requirement for November instruction", confirmed: true as const };
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canReviseTeacherPolicy).toBe(false);
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:revision})).rejects.toThrow("explicit staffing policy publisher");
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify","staffing.policy.publish"]})
          .where(eq(s.roleAssignments.id,reviewRole.id));
        state.actor={...registrarActor,scope:{...registrarActor.scope,siteIds:[otherSite.id]}};
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:revision})).rejects.toThrow("explicit staffing policy publisher");
        state.actor={...registrarActor,capabilities:new Set(["program.launch.start"])};
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:revision})).rejects.toThrow("staffing.policy.publish");
        act("teacher",teacher.id);
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:revision})).rejects.toThrow("role:");
        state.actor=registrarActor;
        await tx.update(s.roleAssignments).set({siteId:otherSite.id}).where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:revision})).rejects.toThrow("explicit staffing policy publisher");
        await tx.update(s.roleAssignments).set({siteId:null}).where(eq(s.roleAssignments.id,reviewRole.id));
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canReviseTeacherPolicy).toBe(true);
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,confirmed:false}})).rejects.toThrow();
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,reason:"short"}})).rejects.toThrow();
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,effectiveFrom:"2020-01-01T00:00:00.000Z"}})).rejects.toThrow("future");
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,qualificationKeys:["unknown"]}})).rejects.toThrow("catalog");
        const revised = await policyRevisions.reviseLaunchTeacherPolicy({data:revision});
        revisionVersionId=revised.versionId;
        expect(revised.created).toBe(true);
        expect(await policyRevisions.reviseLaunchTeacherPolicy({data:revision})).toEqual({versionId:revised.versionId,created:false});
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,qualificationKeys:[definition.key]}})).rejects.toThrow("Policy changed");
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,reason:"Different reason on a stale request"}})).rejects.toThrow("Policy changed");
        const history=(await launch.getLaunchAcademicSetup({data:{programId:program.id}})).teacherPolicies;
        expect(history).toHaveLength(2);
        expect(history[0]).toMatchObject({id:published.versionId,effectiveFrom:null,effectiveThrough:revision.effectiveFrom,qualificationKeys:[definition.key]});
        expect(history[1]).toMatchObject({id:revised.versionId,effectiveFrom:revision.effectiveFrom,effectiveThrough:null});
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,expectedVersionId:revised.versionId,
          effectiveFrom:"2027-10-01T00:00:00.000Z"}})).rejects.toThrow("after the latest");
        expect((await evaluateLaunchTeacher(section.sectionId,teacher.id,tx)).eligible).toBe(false);
        await expect(activateProgram(registrarActor,program.id)).rejects.toThrow("No current verified credential");
        expect(await tx.select().from(s.sectionTeachers).where(eq(s.sectionTeachers.sectionId,section.sectionId))).toHaveLength(2);
        expect((await accessibleClasses(teacherActor)).map(row=>row.id)).toContain(section.sectionId);
        await verifiedClaim(teacher.id,additionalDefinition.id,revision.effectiveFrom);
        // The co-teacher must independently satisfy the same revised requirements.
        await expect(activateProgram(registrarActor,program.id)).rejects.toThrow("No current verified credential");
        await verifiedClaim(coTeacher.id,additionalDefinition.id,revision.effectiveFrom);
        expect((await evaluateLaunchTeacher(section.sectionId,teacher.id,tx)).eligible).toBe(true);
        const revisionAudits=await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,revised.versionId),
          eq(s.auditEvents.action,"launch.teacher_policy.revise")));
        expect(revisionAudits).toHaveLength(1);
        expect(first(revisionAudits).after).toMatchObject({reason:revision.reason,previousVersionId:published.versionId,
          previousEffectiveThrough:revision.effectiveFrom,confirmed:true});
        expect(await tx.select().from(s.domainEvents).where(and(eq(s.domainEvents.aggregateId,revised.versionId),
          eq(s.domainEvents.eventType,"TeacherQualificationPolicyRevised")))).toHaveLength(1);
        await expect(activateLaunch({data:{programId:program.id}})).rejects.toThrow("named receiving site operator");
        await expect(activateLaunch({data:{programId:program.id,recipientPersonId:teacher.id}})).rejects.toThrow("active registrar/operator");
        await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,receiverGrant.id));
        await expect(activateLaunch({data:{programId:program.id,recipientPersonId:receiver.id}})).rejects.toThrow("active registrar/operator");
        await tx.update(s.accountPersonGrants).set({active:true}).where(eq(s.accountPersonGrants.id,receiverGrant.id));
        await tx.update(s.accessAccounts).set({disabled:true}).where(eq(s.accessAccounts.id,receiverAccount.id));
        await expect(activateLaunch({data:{programId:program.id,recipientPersonId:receiver.id}})).rejects.toThrow("active registrar/operator");
        await tx.update(s.accessAccounts).set({disabled:false}).where(eq(s.accessAccounts.id,receiverAccount.id));
        await tx.update(s.accountPersonGrants).set({siteId:otherSite.id}).where(eq(s.accountPersonGrants.id,receiverGrant.id));
        await expect(activateLaunch({data:{programId:program.id,recipientPersonId:receiver.id}})).rejects.toThrow("active registrar/operator");
        await tx.update(s.accountPersonGrants).set({siteId:site.id}).where(eq(s.accountPersonGrants.id,receiverGrant.id));
        expect(first((await listLaunches()).launches).openingOperators.map(row=>row.personId)).toEqual([receiver.id]);
        expect(first(await tx.select().from(s.programs).where(eq(s.programs.id,program.id))).status).toBe("launching");
        expect(await tx.select().from(s.actions).where(and(eq(s.actions.programId,program.id),
          eq(s.actions.type,"program_opening_handoff")))).toEqual([]);
        await activateLaunch({data:{programId:program.id,recipientPersonId:receiver.id}});
        await activateLaunch({data:{programId:program.id,recipientPersonId:receiver.id}});
        await expect(activateLaunch({data:{programId:program.id,recipientPersonId:registrar.id}})).rejects.toThrow("different handoff recipient");
        expect(first(await tx.select().from(s.programs).where(eq(s.programs.id, program.id))).status).toBe("active");
        expect(first(await tx.select().from(s.journeys).where(eq(s.journeys.id, journey.id))).status).toBe("active");
        expect((await launch.getLaunchAcademicSetup({data:{programId:program.id}})).canReviseTeacherPolicy).toBe(false);
        await expect(policyRevisions.reviseLaunchTeacherPolicy({data:{...revision,expectedVersionId:revised.versionId,
          effectiveFrom:"2027-12-01T00:00:00.000Z"}})).rejects.toThrow("pre-opening");
        const today = await getSiteToday({ data: { siteId: site.id } });
        expect(today.programs.find(row => row.id === program.id)?.status).toBe("active");
        expect(today.openingHandoffs).toHaveLength(1);
        const handoff=first(today.openingHandoffs);
        handoffActionId=handoff.id;
        expect(handoff).toMatchObject({ownerPersonId:receiver.id,status:"open",canAcknowledge:false});
        const acknowledgment={actionId:handoff.id,note:"Reviewed the opening record and received daily operations responsibility.",
          confirmed:true as const};
        const replacementAccount=first(await tx.insert(s.accessAccounts).values({
          emailNormalized:`handoff-replacement-${suffix}@example.com`,
        }).returning());
        const replacementGrant=first(await tx.insert(s.accountPersonGrants).values({
          accountId:replacementAccount.id,personId:registrar.id,organizationId:org.id,siteId:site.id,role:"registrar",
        }).returning());
        const recovery={actionId:handoff.id,expectedRevision:0,requestId:crypto.randomUUID(),
          recipientPersonId:registrar.id,reason:"Named operator departed; transfer to the current site registrar.",confirmed:true as const};
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("explicit opening handoff manager");
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify","staffing.policy.publish","program.opening.handoff.manage"]})
          .where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("still eligible");
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("named opening handoff recipient");
        await expect(updateOperationsAction({data:{id:handoff.id,status:"resolved",resolutionNote:"Generic bypass rejected"}}))
          .rejects.toThrow("named-recipient");
        await expect(assignOperationsAction({data:{id:handoff.id,ownerPersonId:registrar.id,priority:"high"}}))
          .rejects.toThrow("named-recipient");
        expect((await getOperationsActions({data:{siteId:site.id,programId:program.id}})).items
          .find(row=>row.id===handoff.id)?.openingHandoff).toBe(true);
        act("teacher",teacher.id);
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("role:");
        const receiverActor=act("registrar",receiver.id);
        expect(first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs).canAcknowledge).toBe(true);
        const handoffNotice=(await getNotifications()).find(row=>row.title==="Launch Program is open - review the handoff");
        expect(handoffNotice?.href).toBe(`/sites/${site.id}`);
        state.actor={...receiverActor,scope:{...receiverActor.scope,programIds:[]}};
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("scope");
        expect((await getSiteToday({data:{siteId:site.id}})).openingHandoffs).toEqual([]);
        expect((await getNotifications()).find(row=>row.title==="Launch Program is open - review the handoff")?.href).toBeNull();
        state.actor=receiverActor;
        state.actor={...receiverActor,capabilities:new Set(["program.read"])};
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("action.resolve");
        state.actor=receiverActor;
        await expect(acknowledgeLaunchHandoff({data:{...acknowledgment,confirmed:false}})).rejects.toThrow();
        await expect(acknowledgeLaunchHandoff({data:{...acknowledgment,note:"short"}})).rejects.toThrow();
        await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,receiverGrant.id));
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("active registrar/operator");
        expect(first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs).canAcknowledge).toBe(false);
        state.actor=registrarActor;
        expect(first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs).replacementOperators.map(row=>row.personId))
          .toEqual([registrar.id]);
        state.actor={...registrarActor,scope:{...registrarActor.scope,programIds:[]}};
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("scope");
        state.actor=registrarActor;
        state.actor={...registrarActor,capabilities:new Set(["action.resolve"])};
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("program.opening.handoff.manage");
        state.actor=registrarActor;
        await tx.update(s.roleAssignments).set({siteId:otherSite.id}).where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("explicit opening handoff manager");
        await tx.update(s.roleAssignments).set({siteId:null}).where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(transferLaunchHandoff({data:{...recovery,confirmed:false}})).rejects.toThrow();
        await expect(transferLaunchHandoff({data:{...recovery,reason:"short"}})).rejects.toThrow();
        await expect(transferLaunchHandoff({data:{...recovery,recipientPersonId:teacher.id}})).rejects.toThrow("replacement");
        await tx.update(s.accountPersonGrants).set({active:false}).where(eq(s.accountPersonGrants.id,replacementGrant.id));
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("replacement");
        await tx.update(s.accountPersonGrants).set({active:true}).where(eq(s.accountPersonGrants.id,replacementGrant.id));
        expect(await transferLaunchHandoff({data:recovery})).toEqual({actionId:handoff.id,revision:1});
        expect(await transferLaunchHandoff({data:recovery})).toEqual({actionId:handoff.id,revision:1});
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify","staffing.policy.publish"]})
          .where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(transferLaunchHandoff({data:recovery})).rejects.toThrow("explicit opening handoff manager");
        await tx.update(s.roleAssignments).set({capabilities:["profiles.credentials.verify","staffing.policy.publish","program.opening.handoff.manage"]})
          .where(eq(s.roleAssignments.id,reviewRole.id));
        await expect(transferLaunchHandoff({data:{...recovery,reason:"Changed reason on same retry request"}})).rejects.toThrow("different details");
        await expect(transferLaunchHandoff({data:{...recovery,requestId:crypto.randomUUID()}})).rejects.toThrow("Handoff changed");
        state.actor=receiverActor;
        await expect(acknowledgeLaunchHandoff({data:acknowledgment})).rejects.toThrow("named opening handoff recipient");
        expect((await getNotifications()).find(row=>row.title==="Launch Program is open - review the handoff")?.href).toBeNull();
        state.actor=registrarActor;
        const recovered=first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs);
        expect(recovered).toMatchObject({ownerPersonId:registrar.id,status:"open",revision:1,canAcknowledge:true,
          lastTransfer:{previousOwnerPersonId:receiver.id,reason:recovery.reason}});
        expect(recovered.openedAt).toBe(handoff.openedAt);
        expect(recovered.sectionCountAtOpening).toBe(handoff.sectionCountAtOpening);
        expect((await getNotifications()).find(row=>row.title==="Launch Program - opening handoff transferred to you")?.href)
          .toBe(`/sites/${site.id}`);
        const transferAudits=await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,handoff.id),
          eq(s.auditEvents.action,"program.opening.handoff.transfer")));
        expect(transferAudits).toHaveLength(1);
        expect(first(transferAudits).before).toMatchObject({ownerPersonId:receiver.id,revision:0});
        expect(first(transferAudits).after).toMatchObject({ownerPersonId:registrar.id,reason:recovery.reason,revision:1});
        await acknowledgeLaunchHandoff({data:acknowledgment});
        await acknowledgeLaunchHandoff({data:acknowledgment});
        await expect(acknowledgeLaunchHandoff({data:{...acknowledgment,note:"Changed acknowledgment text after receipt"}}))
          .rejects.toThrow("different note");
        await expect(transferLaunchHandoff({data:{...recovery,expectedRevision:1,requestId:crypto.randomUUID()}}))
          .rejects.toThrow("Only pending");
        expect(first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs)).toMatchObject({
          status:"resolved",resolutionNote:acknowledgment.note,canAcknowledge:false,resolvedAt:expect.any(String),
        });
        state.actor=registrarActor;
        expect(first((await getSiteToday({data:{siteId:site.id}})).openingHandoffs).status).toBe("resolved");
        expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,handoff.id),
          eq(s.auditEvents.action,"program.opening.handoff.create")))).toHaveLength(1);
        expect(await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.resourceId,handoff.id),
          eq(s.auditEvents.action,"program.opening.handoff.acknowledge")))).toHaveLength(1);
        const handoffEvents=await tx.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,handoff.id));
        for(const type of ["ActionCreated","ProgramOpeningHandoffCreated","ProgramOpeningHandoffTransferred","ProgramOpeningHandoffAcknowledged","ActionResolved"])
          expect(handoffEvents.filter(row=>row.eventType===type)).toHaveLength(1);
        expect(await tx.select().from(s.notifications).where(and(eq(s.notifications.resourceId,handoff.id),
          eq(s.notifications.type,"program_opening_handoff")))).toHaveLength(2);
        const audits = await tx.select().from(s.auditEvents).where(inArray(s.auditEvents.resourceId,
          [program.id, published.versionId, section.sectionId, secondSection.sectionId]));
        expect(audits.filter(row => row.action === "program.activate")).toHaveLength(1);
        const policyRuleIds=(await tx.select({id:s.compliancePolicyRules.id}).from(s.compliancePolicyRules)
          .where(inArray(s.compliancePolicyRules.frameworkVersionId,[published.versionId,revised.versionId]))).map(row=>row.id);
        const activationEvidence=JSON.stringify(first(audits.filter(row=>row.action==="program.activate")).after);
        for(const ruleId of policyRuleIds) expect(activationEvidence).toContain(ruleId);
        expect(audits.filter(row => row.action === "launch.teacher_policy.publish")).toHaveLength(1);
        expect(audits.filter(row => row.action === "launch.section.provision")).toHaveLength(2);
        const arrangements = await tx.select().from(s.deliveryArrangements).where(inArray(s.deliveryArrangements.sectionId,
          [section.sectionId, secondSection.sectionId]));
        const assignmentAudits = await tx.select().from(s.auditEvents).where(inArray(s.auditEvents.resourceId, arrangements.map(row => row.id)));
        expect(assignmentAudits.filter(row => row.action === "launch.teacher.assign")).toHaveLength(3);
        expect(first(assignmentAudits.filter(row => row.action === "launch.teacher.assign")).after?.verificationEventIds).toBeDefined();
        const evaluations=await tx.select().from(s.staffingEligibilityEvaluations)
          .where(inArray(s.staffingEligibilityEvaluations.roleAssignmentId,
            (await tx.select({id:s.roleAssignments.id}).from(s.roleAssignments)
              .where(inArray(s.roleAssignments.personId,[teacher.id,coTeacher.id]))).map(row=>row.id)));
        expect(evaluations).toHaveLength(3);
        expect(evaluations.every(row=>row.result==="eligible"&&row.evidenceIds.length>0)).toBe(true);
        const events = await tx.select().from(s.domainEvents).where(inArray(s.domainEvents.aggregateId,
          [program.id, published.versionId, ...arrangements.map(row => row.id)]));
        expect(events.filter(row => row.eventType === "ProgramActivated")).toHaveLength(1);
        expect(events.filter(row => row.eventType === "TeacherQualificationPolicyPublished")).toHaveLength(1);
        expect(events.filter(row => row.eventType === "DeliveryArrangementActivated")).toHaveLength(3);
        const notices = await tx.select().from(s.notifications).where(inArray(s.notifications.recipientPersonId, [teacher.id, coTeacher.id]));
        expect(notices.filter(row => row.type === "teaching_assignment")).toHaveLength(3);
        expect(storage.verifyPrivateObject).toHaveBeenCalledWith(expect.objectContaining({
          keyPattern: expect.any(RegExp), expectedSize: 128, expectedContentType: "application/pdf", verifySignature: expect.any(Function),
        }));
        expect(storage.createPrivateUploadUrl).toHaveBeenCalledWith(expect.objectContaining({preventOverwrite:true}));
        expect(storage.signPrivateObjectUrl).toHaveBeenCalledWith(expect.objectContaining({ method: "GET", expiresSeconds: 60 }));
        const evidenceAudits=await tx.select().from(s.auditEvents).where(and(eq(s.auditEvents.actorPersonId,registrar.id),
          eq(s.auditEvents.action,"qualification.evidence_read")));
        expect(evidenceAudits).toHaveLength(5);
        const submittedClaims=await tx.select().from(s.qualificationClaims)
          .where(inArray(s.qualificationClaims.personId,[teacher.id,coTeacher.id]));
        expect(submittedClaims).toHaveLength(6);
        const credentialEvents=await tx.select().from(s.domainEvents)
          .where(inArray(s.domainEvents.aggregateId,submittedClaims.map(row=>row.id)));
        expect(credentialEvents.filter(row=>row.eventType==="QualificationClaimCreated")).toHaveLength(6);
        expect(credentialEvents.filter(row=>row.eventType==="QualificationVerificationDecided")).toHaveLength(13);
        const credentialAudits=await tx.select().from(s.auditEvents)
          .where(inArray(s.auditEvents.resourceId,submittedClaims.map(row=>row.id)));
        expect(credentialAudits.filter(row=>row.action==="qualification.claim_created")).toHaveLength(6);
        expect(credentialAudits.filter(row=>row.action==="qualification.verification.decided")).toHaveLength(13);
        const { replaceSectionTeacher } = await import("@/modules/programs/section-lifecycle-service");
        await expect(replaceSectionTeacher(registrarActor, { sectionId: section.sectionId,
          oldPersonId: teacher.id, newPersonId: outsider.id, reason: "Synthetic replacement denial" })).rejects.toThrow("provider-owned teacher role");
        await replaceSectionTeacher(registrarActor, { sectionId: section.sectionId,
          oldPersonId: teacher.id, newPersonId: coTeacher.id, reason: "Synthetic approved replacement" });
        expect((await accessibleClasses(teacherActor)).map(row => row.id)).toEqual([secondSection.sectionId]);
        await expect(authorizeClass(teacherActor, section.sectionId)).rejects.toThrow("assigned teacher");
        expect((await evaluateLaunchStaffing(section.sectionId, tx)).ready).toBe(true);
        expect(first(await tx.select().from(s.deliveryArrangements).where(and(
          eq(s.deliveryArrangements.sectionId, section.sectionId), eq(s.deliveryArrangements.instructorPersonId, teacher.id),
        ))).status).toBe("completed");
        checked = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    } finally {
      state.tx = undefined;
      state.actor = undefined;
      vi.unstubAllEnvs();
    }
    expect(checked).toBe(true);
    expect(await database.select().from(s.people).where(eq(s.people.id, teacherId))).toEqual([]);
    expect(await database.select().from(s.qualificationDefinitions).where(eq(s.qualificationDefinitions.key,definitionKey))).toEqual([]);
    expect(await database.select().from(s.complianceFrameworks).where(eq(s.complianceFrameworks.key, `launch-teacher:${programId}`))).toEqual([]);
    expect(await database.select().from(s.complianceFrameworkVersions).where(eq(s.complianceFrameworkVersions.id,revisionVersionId))).toEqual([]);
    expect(await database.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,revisionVersionId))).toEqual([]);
    expect(await database.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,revisionVersionId))).toEqual([]);
    expect(await database.select().from(s.actions).where(eq(s.actions.id,handoffActionId))).toEqual([]);
    expect(await database.select().from(s.auditEvents).where(eq(s.auditEvents.resourceId,handoffActionId))).toEqual([]);
    expect(await database.select().from(s.notifications).where(eq(s.notifications.resourceId,handoffActionId))).toEqual([]);
    expect(await database.select().from(s.domainEvents).where(eq(s.domainEvents.aggregateId,handoffActionId))).toEqual([]);
    expect((await database.execute(sql`select enumlabel from pg_enum
      where enumtypid = 'compliance_framework_version_status'::regtype order by enumsortorder`)).rows).toEqual(beforeEnum.rows);
  }, 180_000);
});
