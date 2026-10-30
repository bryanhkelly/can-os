import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { resolveAccessContext } from "@/domain/access-context";
import type { AccessContext } from "@/domain/access-context";
import type { Actor } from "@/modules/identity/actors.server";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const state = vi.hoisted(() => ({ tx: undefined as Transaction | undefined }));
vi.mock("@/db/client", () => ({
  get db() {
    if (!state.tx) throw new Error("Program-Site authorization acceptance requires a rollback transaction");
    return state.tx;
  },
}));

const integration = process.env.DATABASE_URL ? describe : describe.skip;

integration("Church-owned Site with independently authorized CAN academic services", () => {
  it("requests, independently reviews, enforces and revokes precise Program-Site authority", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-authority");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { and, eq } = await import("drizzle-orm");
        const { startProgramLaunch } = await import("@/modules/programs/program-launch-service");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          revokeProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
          requireInstitutionalAcademicProgramAuthority,requireChurchHostedOperatingServices,
          getHostProgramSiteAuthorization, listCANOperatingAuthorizationDesk,
        } = await import("@/modules/programs/program-site-authorization.server");
        const {listDelegatedCANTranscriptPrograms}=await import("@/modules/learning/can-transcript-scope.server");
        const {delegateCANAcademicProgramStaff,revokeCANAcademicProgramStaff,listCANAcademicProgramStaff}=await import("@/modules/programs/can-academic-staff-delegation.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const [can, church, other] = await Promise.all([
          tx.insert(s.organizations).values({
            type:"can_network", name:"CAN Test " + suffix, slug:"can-operating-"+suffix,
          }).returning(),
          tx.insert(s.organizations).values({
            type:"church", name:"Fellowship Test " + suffix, slug:"church-operating-"+suffix,
          }).returning(),
          tx.insert(s.organizations).values({
            type:"church", name:"Unrelated Church " + suffix, slug:"other-operating-"+suffix,
          }).returning(),
        ]).then(rows=>rows.map(x=>x[0]!));
        const [site] = await tx.insert(s.sites).values({
          organizationId:church.id, name:"Host Campus",slug:"host-"+suffix,
          timezone:"America/Chicago",
        }).returning();
        const [jurisdiction] = await tx.insert(s.jurisdictions).values({
          code:"test-op-"+suffix,name:"Synthetic operating jurisdiction",
        }).returning();
        const [hostPerson, stewardPerson, verifierPerson] = await Promise.all([
          tx.insert(s.people).values({legalFirstName:"Host",legalLastName:"Registrar"}).returning(),
          tx.insert(s.people).values({legalFirstName:"CAN",legalLastName:"Approver"}).returning(),
          tx.insert(s.people).values({legalFirstName:"Independent",legalLastName:"Verifier"}).returning(),
        ]).then(rows=>rows.map(x=>x[0]!));
        await tx.insert(s.journeyDefinitions).values({
          key:"program-launch",version:"authority-"+suffix,
          owningOrganizationId:can.id,audience:"partner",title:"Program launch",
          configuration:{requirements:[{key:"staffing",title:"Staffing",blocking:true,owner:"partner"}]},
        });
        const contextFor=(role:"registrar"|"can_network_steward"|"teacher"|"site_staff",personId:string,orgId:string,siteId:string|null):AccessContext=>{
          const grant={id:crypto.randomUUID(),accountId:crypto.randomUUID(),personId,role,
            organizationId:orgId,siteId,active:true};
          return resolveAccessContext({
            accountId:grant.accountId,activeGrantId:grant.id,sessionId:"synthetic-rollback",
          },[grant]);
        };
        const host = contextFor("registrar",hostPerson.id,church.id,site.id);
        const steward = contextFor("can_network_steward",stewardPerson.id,can.id,null);
        const unrelated = contextFor("registrar",hostPerson.id,other.id,null);
        const launch = await startProgramLaunch(host,{
          hostOrganizationId:church.id,siteId:site.id,jurisdictionId:jurisdiction.id,
          type:"church_hosted_academy",name:"Fellowship CAN Academy",
          slug:"fellowship-"+suffix,
          gradeRange:{min:"9",max:"12"},
          deliveryModel:{onsite:true,asynchronous:true,onsiteDaysPerWeek:2},
          academicProviderOrganizationId:can.id,
          creditIssuingOrganizationId:can.id,
          creditMode:"credit_bearing",
        });
        host.scope.programIds=[launch.programId];
        // This is a deliberately real site-bound staff grant without an
        // independent local director/Section facilitator appointment.
        // Neither the public roster endpoint nor a direct write/replay may
        // treat it as authorized custody of church-hosted students.
        const [genericPerson]=await tx.insert(s.people).values({
          legalFirstName:"Generic",legalLastName:"Site Staff",
        }).returning();
        const genericStaff=contextFor("site_staff",genericPerson!.id,church.id,site.id);
        genericStaff.scope.programIds=[launch.programId];
        const {recordAttendanceRevision}=await import("@/modules/attendance/attendance-service");
        await expect(recordAttendanceRevision(genericStaff,{
          studentProfileId:crypto.randomUUID(),programId:launch.programId,
          siteId:site.id,occurrenceKey:"2026-10-24:site-day",
          expectedAt:new Date("2026-10-24T12:00:00Z"),
          status:"present",mutationId:crypto.randomUUID(),
          requireExpectedOnsiteDate:"2026-10-24",
        })).rejects.toThrow("independent church attendance requires named local delegation");
        // A CAN Organization grant alone does not expose a church's records.
        // Only an exact institution-owned role/capability on this Program may
        // unlock transcript reads, and never without a live school agreement.
        const [canRecordPerson]=await tx.insert(s.people).values({
          legalFirstName:"CAN",legalLastName:"Academic Registrar",
        }).returning();
        const canRegistrar=contextFor("registrar",canRecordPerson!.id,can.id,null);
        const [recordRole]=await tx.insert(s.roleAssignments).values({
          personId:canRecordPerson!.id,organizationId:can.id,
          programId:launch.programId,siteId:null,roleKey:"registrar",
          capabilities:["academic_records.issue"],
        }).returning();
        expect(await listDelegatedCANTranscriptPrograms(host,tx)).toEqual([]);
        expect(await listDelegatedCANTranscriptPrograms(canRegistrar,tx)).toEqual([]);
        const services=[
          "academic_instruction","academic_records","onsite_supervision",
          "school_of_record","credit_issuance","admissions","curriculum",
        ];
        await expect(requestProgramSiteAuthorization(unrelated,{
          programId:launch.programId,services,
        })).rejects.toThrow();

        const requested = await requestProgramSiteAuthorization(host,{
          programId:launch.programId,services,
        });
        authorizationId=requested.authorizationId;
        expect(requested).toMatchObject({created:true,status:"requested"});
        expect(await requestProgramSiteAuthorization(host,{
          programId:launch.programId,services,
        })).toMatchObject({authorizationId,created:false});
        const hostStatus=await getHostProgramSiteAuthorization(host,launch.programId);
        expect(hostStatus.authorization?.status).toBe("requested");
        await expect(requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "academic_instruction","onsite_supervision",
        ])).rejects.toThrow();
        await expect(requireChurchHostedOperatingServices(tx,launch.programId,
          ["onsite_supervision"])).rejects.toThrow();
        const canDesk=await listCANOperatingAuthorizationDesk(steward);
        expect(canDesk.authorizations.some(x=>x.id===authorizationId)).toBe(true);

        const [wrongDocument, approvedDocument] = await Promise.all([
          tx.insert(s.documents).values({
            subjectType:"program",subjectId:launch.programId,
            category:"program_site_operating_agreement",fileName:"wrong-site.pdf",
            storageProvider:"synthetic-test",storageKey:"wrong-"+suffix,
            uploadedByPersonId:hostPerson.id,
            verifiedAt:new Date(Date.now()-3600000),verifiedByPersonId:verifierPerson.id,
            metadata:{
              hostOrganizationId:church.id,institutionOrganizationId:can.id,
              siteId:crypto.randomUUID(),creditIssuingOrganizationId:can.id,
              hostSignatureVerified:true,institutionSignatureVerified:true,
              authorizedServices:services,
            },
          }).returning(),
          tx.insert(s.documents).values({
            subjectType:"program",subjectId:launch.programId,
            category:"program_site_operating_agreement",fileName:"signed.pdf",
            storageProvider:"synthetic-test",storageKey:"approved-"+suffix,
            uploadedByPersonId:hostPerson.id,
            verifiedAt:new Date(Date.now()-3600000),verifiedByPersonId:verifierPerson.id,
            metadata:{
              hostOrganizationId:church.id,institutionOrganizationId:can.id,
              siteId:site.id,creditIssuingOrganizationId:can.id,
              hostSignatureVerified:true,institutionSignatureVerified:true,
              authorizedServices:services,
            },
          }).returning(),
        ]).then(rows=>rows.map(x=>x[0]!));
        const from=new Date(Date.now()-3600000);
        const through=new Date(Date.now()+86400000*180);
        await expect(reviewProgramSiteAuthorization(host,{
          authorizationId,decision:"approved",reason:"Church cannot self-approve school authority.",
          evidenceDocumentId:approvedDocument.id,effectiveFrom:from,effectiveThrough:through,
        })).rejects.toThrow();
        await expect(reviewProgramSiteAuthorization(steward,{
          authorizationId,decision:"approved",reason:"Invalid site evidence must be rejected.",
          evidenceDocumentId:wrongDocument.id,effectiveFrom:from,effectiveThrough:through,
        })).rejects.toThrow();
        await reviewProgramSiteAuthorization(steward,{
          authorizationId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:approvedDocument.id,effectiveFrom:from,effectiveThrough:through,
        });
        expect(await requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "academic_instruction","academic_records","onsite_supervision",
          "school_of_record","credit_issuance",
        ])).toBe(authorizationId);
        expect(await requireChurchHostedOperatingServices(tx,launch.programId,
          ["onsite_supervision"])).toBe(authorizationId);
        expect(await requireChurchHostedOperatingServices(tx,launch.programId,
          ["admissions","school_of_record"])).toBe(authorizationId);
        expect(await listDelegatedCANTranscriptPrograms(canRegistrar,tx))
          .toEqual([{programId:launch.programId,siteId:site.id}]);
        // Revoked capability leaves the issuer's real account grant intact,
        // but removes their church-academic-record projection immediately.
        await tx.update(s.roleAssignments).set({capabilities:[]})
          .where(eq(s.roleAssignments.id,recordRole!.id));
        expect(await listDelegatedCANTranscriptPrograms(canRegistrar,tx)).toEqual([]);
        await tx.update(s.roleAssignments).set({capabilities:["academic_records.issue"]})
          .where(eq(s.roleAssignments.id,recordRole!.id));
        // The steward can delegate only to an already verified active CAN
        // employee's original CAN Organization account, without creating a
        // church Site account or widening their ordinary Program projection.
        const [staffPerson]=await tx.insert(s.people).values({
          legalFirstName:"CAN",legalLastName:"Records Officer",
        }).returning();
        const [staffAccount]=await tx.insert(s.accessAccounts).values({
          emailNormalized:"can-records-"+suffix+"@example.invalid",
          emailVerifiedAt:new Date(),
        }).returning();
        await tx.insert(s.accountPersonGrants).values({
          personId:staffPerson!.id,accountId:staffAccount!.id,
          organizationId:can.id,siteId:null,role:"registrar",
        });
        const staffActor=contextFor("registrar",staffPerson!.id,can.id,null);
        const staffCommand={
          programId:launch.programId,personId:staffPerson!.id,
          role:"registrar" as const,
          reason:"CAN maintains the official academic record for this school.",
        };
        await expect(delegateCANAcademicProgramStaff(host,staffCommand)).rejects.toThrow();
        const granted=await delegateCANAcademicProgramStaff(steward,staffCommand);
        expect(granted.created).toBe(true);
        expect((await delegateCANAcademicProgramStaff(steward,staffCommand)).created).toBe(false);
        expect((await listCANAcademicProgramStaff(steward,launch.programId)).current
          .some(row=>row.id===granted.roleAssignmentId)).toBe(true);
        expect(await listDelegatedCANTranscriptPrograms(staffActor,tx))
          .toEqual([{programId:launch.programId,siteId:site.id}]);
        await revokeCANAcademicProgramStaff(steward,{
          roleAssignmentId:granted.roleAssignmentId,
          reason:"The academic registrar is no longer assigned to this school.",
        });
        expect(await listDelegatedCANTranscriptPrograms(staffActor,tx)).toEqual([]);
        expect((await listCANAcademicProgramStaff(steward,launch.programId)).current
          .some(row=>row.id===granted.roleAssignmentId)).toBe(false);
        await expect(revokeCANAcademicProgramStaff(steward,{
          roleAssignmentId:granted.roleAssignmentId,reason:"Repeat revocation must not reactivate access.",
        })).rejects.toThrow("specific CAN-owned academic staff delegation");
        const renewed=await delegateCANAcademicProgramStaff(steward,staffCommand);
        expect(renewed).toEqual({roleAssignmentId:granted.roleAssignmentId,created:true});
        expect(await listDelegatedCANTranscriptPrograms(staffActor,tx))
          .toEqual([{programId:launch.programId,siteId:site.id}]);
        // Contracting authority is not a host registrar's CAN membership.
        await expect(requireInstitutionalAcademicProgramAuthority(tx,host,
          launch.programId,["academic_instruction","academic_records"]))
          .rejects.toThrow();
        // This helper proves entitlement only; the steward still has neither
        // a teacher grant nor an academic registrar grant to perform writes.
        expect(await requireInstitutionalAcademicProgramAuthority(tx,steward,
          launch.programId,["academic_instruction","academic_records"]))
          .toBe(authorizationId);
        expect(await requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "curriculum",
        ])).toBe(authorizationId);
        expect(await requireChurchHostedOperatingServices(tx,launch.programId,
          ["curriculum"])).toBe(authorizationId);
        // P0: a church facilitator or local "teacher" cannot become the
        // institution's academic instructor. The original provider-wide CAN
        // identity, signed curriculum agreement AND exact Section assignment
        // must jointly authorize one real class. Revoke and prove immediate
        // denial from a still-signed-in CAN teacher context.
        const {createAcademicTimeFixture}=await import("./helpers/academic-time");
        const time=await createAcademicTimeFixture({
          organizationId:church.id,siteId:site.id,
          programId:launch.programId,suffix:"teacher-"+suffix,
        });
        const [course]=await tx.insert(s.courseTemplates).values({
          owningOrganizationId:can.id,code:"can-"+suffix,
          title:"CAN First Class",subject:"Mathematics",
        }).returning();
        const [curriculum]=await tx.insert(s.courseTemplateVersions).values({
          courseTemplateId:course!.id,version:1,status:"published",
          curriculum:{learning:{version:1,modules:[{
            id:"intro",title:"Beginning Algebra",lessons:[{
              id:"first",title:"Your First Lesson",body:"Practice working with expressions.",resources:[],
            }],
          }]}},
        }).returning();
        const [section]=await tx.insert(s.sections).values({
          programId:launch.programId,siteId:site.id,termId:time.term.id,
          courseTemplateVersionId:curriculum!.id,code:"first-"+suffix,
          title:"First CAN Class",
        }).returning();
        const [localPerson,canPerson]=await Promise.all([
          tx.insert(s.people).values({
            legalFirstName:"Local",legalLastName:"Facilitator",
          }).returning().then(x=>x[0]!),
          tx.insert(s.people).values({
            legalFirstName:"CAN",legalLastName:"Instructor",
          }).returning().then(x=>x[0]!),
        ]);
        const [localAccount,canAccount]=await Promise.all([
          tx.insert(s.accessAccounts).values({
            emailNormalized:"local-"+suffix+"@example.invalid",
            emailVerifiedAt:new Date(),
          }).returning().then(x=>x[0]!),
          tx.insert(s.accessAccounts).values({
            emailNormalized:"can-teacher-"+suffix+"@example.invalid",
            emailVerifiedAt:new Date(),
          }).returning().then(x=>x[0]!),
        ]);
        const [localGrant,canGrant]=await Promise.all([
          tx.insert(s.accountPersonGrants).values({
            accountId:localAccount.id,personId:localPerson.id,role:"teacher",
            organizationId:church.id,siteId:site.id,
          }).returning().then(x=>x[0]!),
          tx.insert(s.accountPersonGrants).values({
            accountId:canAccount.id,personId:canPerson.id,role:"teacher",
            organizationId:can.id,siteId:null,
          }).returning().then(x=>x[0]!),
        ]);
        // Placement verification requires EVERY assigned teacher to be
        // eligible; the host-local facilitator is assigned only later, for
        // the class-access denial checks. The CAN instructor is assigned below
        // through the real launch command after delegation and qualification.
        const teacherDelegation=await delegateCANAcademicProgramStaff(steward,{
          programId:launch.programId,personId:canPerson.id,role:"teacher",
          reason:"CAN delegates instruction for this exact contracted Program.",
        });
        const {staffedPublishedSectionIds}=await import(
          "@/modules/enrollment/instructional-section-readiness.server");
        const {verifiedTeacherSectionIds}=await import(
          "@/modules/enrollment/verified-section-teachers.server");
        const {enablePublishedPolicyInRollback}=await import("./helpers/published-policy");
        await enablePublishedPolicyInRollback(tx);
        const {createTeachingQualificationFixture}=await import("./helpers/teaching-qualification");
        const teachingQualification=await createTeachingQualificationFixture(tx,{
          sectionId:section!.id,personId:canPerson.id,verifierPersonId:verifierPerson.id,
          issuedAt:new Date(Date.now()-86_400_000),
        });
        const {assignLaunchInstructor}=await import("@/modules/staffing/launch-staffing.server");
        await expect(assignLaunchInstructor(tx,host,{
          programId:launch.programId,sectionId:section!.id,teacherPersonId:canPerson.id,
        })).resolves.toEqual({created:true});
        await expect(assignLaunchInstructor(tx,host,{
          programId:launch.programId,sectionId:section!.id,teacherPersonId:canPerson.id,
        })).resolves.toEqual({created:false});
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(true);
        await tx.update(s.accountPersonGrants).set({active:false})
          .where(eq(s.accountPersonGrants.id,canGrant.id));
        // Without an eligible CAN provider teacher, enrollment cannot claim
        // an actually staffed academic class.
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        await tx.update(s.accountPersonGrants).set({active:true})
          .where(eq(s.accountPersonGrants.id,canGrant.id));
        const localTeacher=contextFor("teacher",localPerson.id,church.id,site.id);
        localTeacher.scope.programIds=[launch.programId];
        const canTeacher=contextFor("teacher",canPerson.id,can.id,null);
        canTeacher.scope.sectionIds=[section!.id];
        const {authorizeClass,accessibleClasses}=await import(
          "@/modules/learning/class-access.server");
        await expect(authorizeClass(localTeacher as Actor,section!.id))
          .rejects.toThrow("CAN academic provider teacher");
        expect((await authorizeClass(canTeacher as Actor,section!.id)).section.id)
          .toBe(section!.id);
        expect((await accessibleClasses(canTeacher as Actor)).map(x=>x.id))
          .toEqual([section!.id]);
        const [otherSection]=await tx.insert(s.sections).values({
          programId:launch.programId,siteId:site.id,termId:time.term.id,
          courseTemplateVersionId:curriculum!.id,code:"other-"+suffix,
          title:"Another CAN Class",
        }).returning();
        await expect(authorizeClass(canTeacher as Actor,otherSection!.id))
          .rejects.toThrow("CAN academic provider teacher assigned to exact Section");
        // Expiry denies every new delegated academic act even when the original
        // account, named delegation, Section assignment and credentials remain.
        // Restoring the fixture's clock window does not rewrite any history.
        await tx.update(s.programSiteAuthorizations).set({
          effectiveThrough:new Date(Date.now()-1000),
        }).where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(await listDelegatedCANTranscriptPrograms(staffActor,tx)).toEqual([]);
        expect(await accessibleClasses(canTeacher as Actor)).toEqual([]);
        await expect(authorizeClass(canTeacher as Actor,section!.id)).rejects.toThrow();
        await expect(assignLaunchInstructor(tx,host,{
          programId:launch.programId,sectionId:section!.id,teacherPersonId:canPerson.id,
        })).rejects.toThrow("current independently verified CAN-church operating authority");
        await tx.update(s.programSiteAuthorizations).set({effectiveThrough:through})
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect((await authorizeClass(canTeacher as Actor,section!.id)).section.id).toBe(section!.id);
        // A host-local Section assignment alone never grants access to a
        // CAN-provided class, and an ineligible local assignee must not
        // combine with the CAN instructor's coverage for placement.
        await tx.insert(s.sectionTeachers).values(
          {sectionId:section!.id,personId:localPerson.id},
        );
        expect((await accessibleClasses(localTeacher as Actor)).map(x=>x.id))
          .not.toContain(section!.id);
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        await tx.delete(s.sectionTeachers).where(and(
          eq(s.sectionTeachers.sectionId,section!.id),
          eq(s.sectionTeachers.personId,localPerson.id),
        ));
        // A retained assignment and signed agreement cannot preserve a revoked credential.
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId:teachingQualification.claimId,sequence:2,decision:"revoke",
          actorPersonId:verifierPerson.id,
        });
        expect(await staffedPublishedSectionIds([section!.id],tx)).toEqual(new Set());
        await expect(authorizeClass(canTeacher as Actor,section!.id)).rejects.toThrow();
        expect(await accessibleClasses(canTeacher as Actor)).toEqual([]);
        await tx.insert(s.qualificationVerificationEvents).values({
          claimId:teachingQualification.claimId,sequence:3,decision:"approve",
          actorPersonId:verifierPerson.id,
        });
        expect((await authorizeClass(canTeacher as Actor,section!.id)).section.id).toBe(section!.id);
        // Revoke ONLY the Program delegation. Keep the contract, verified
        // CAN account and historical Section assignment intact. Even an older
        // authenticated context must immediately lose this teaching access.
        expect((await staffedPublishedSectionIds([section!.id],tx)).has(section!.id)).toBe(true);
        const complianceHistory=await tx.select({id:s.staffingEligibilityEvaluations.id})
          .from(s.staffingEligibilityEvaluations)
          .where(eq(s.staffingEligibilityEvaluations.roleAssignmentId,
            teacherDelegation.roleAssignmentId));
        expect(complianceHistory.length).toBeGreaterThan(0);
        await revokeCANAcademicProgramStaff(steward,{
          roleAssignmentId:teacherDelegation.roleAssignmentId,
          reason:"CAN withdraws this instructor from the contracted Program.",
        });
        const [revokedAssignment]=await tx.select({
          capabilities:s.roleAssignments.capabilities,
          revokedAt:s.roleAssignments.metadata,
        }).from(s.roleAssignments)
          .where(eq(s.roleAssignments.id,teacherDelegation.roleAssignmentId));
        expect(revokedAssignment?.capabilities).toEqual([]);
        expect(revokedAssignment?.revokedAt?.revokedAt).toEqual(expect.any(String));
        expect(await tx.select({id:s.staffingEligibilityEvaluations.id})
          .from(s.staffingEligibilityEvaluations)
          .where(eq(s.staffingEligibilityEvaluations.roleAssignmentId,
            teacherDelegation.roleAssignmentId))).toEqual(complianceHistory);
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        expect((await staffedPublishedSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        await expect(authorizeClass(canTeacher as Actor,section!.id))
          .rejects.toThrow("current provider-owned teacher Program delegation");
        expect(await accessibleClasses(canTeacher as Actor)).toEqual([]);
        // Restore through the canonical command for the remaining agreement tests.
        const restoredTeacherDelegation=await delegateCANAcademicProgramStaff(steward,{
          programId:launch.programId,personId:canPerson.id,role:"teacher",
          reason:"CAN restores instruction for the remaining acceptance checks.",
        });
        expect(restoredTeacherDelegation).toEqual({
          roleAssignmentId:teacherDelegation.roleAssignmentId,created:true,
        });
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(true);
        expect((await authorizeClass(canTeacher as Actor,section!.id)).section.id)
          .toBe(section!.id);
        const [original] = await tx.select({
          organizationId:s.programs.organizationId,
          status:s.programs.status,
          siteOwner:s.sites.organizationId,
        }).from(s.programs).innerJoin(s.sites,eq(s.programs.siteId,s.sites.id))
          .where(eq(s.programs.id,launch.programId));
        expect(original).toMatchObject({
          organizationId:church.id,siteOwner:church.id,status:"launching",
        });
        await revokeProgramSiteAuthorization(host,{
          authorizationId,reason:"The host church withdrew contractual authorization.",
        });
        expect(await listDelegatedCANTranscriptPrograms(canRegistrar,tx)).toEqual([]);
        expect(await listDelegatedCANTranscriptPrograms(staffActor,tx)).toEqual([]);
        await expect(delegateCANAcademicProgramStaff(steward,staffCommand)).rejects.toThrow();
        // Removing an employee's Program grant remains possible even when
        // the school-services agreement has already been suspended.
        await revokeCANAcademicProgramStaff(steward,{
          roleAssignmentId:renewed.roleAssignmentId,
          reason:"Remove all remaining record access after school service withdrawal.",
        });
        // Session-derived Section scope can remain cached: it is NOT authority
        // after the signed CAN/church academic agreement has been revoked.
        expect((await accessibleClasses(canTeacher as Actor)).map(x=>x.id))
          .not.toContain(section!.id);
        await expect(authorizeClass(canTeacher as Actor,section!.id))
          .rejects.toThrow();
        await expect(assignLaunchInstructor(tx,host,{
          programId:launch.programId,sectionId:section!.id,teacherPersonId:canPerson.id,
        })).rejects.toThrow("current independently verified CAN-church operating authority");
        const historicalAssignment=await tx.select({id:s.sectionTeachers.id})
          .from(s.sectionTeachers).where(and(
            eq(s.sectionTeachers.sectionId,section!.id),
            eq(s.sectionTeachers.personId,canPerson.id),
          ));
        expect(historicalAssignment).toHaveLength(1);
        await expect(requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow();
        await expect(requireInstitutionalAcademicProgramAuthority(tx,steward,
          launch.programId,["school_of_record","academic_records","credit_issuance"]))
          .rejects.toThrow();
        await expect(requireChurchHostedOperatingServices(tx,launch.programId,
          ["onsite_supervision"])).rejects.toThrow();
        const [revoked] = await tx.select({
          status:s.programSiteAuthorizations.status,
          reviewReason:s.programSiteAuthorizations.reviewReason,
          revocationReason:s.programSiteAuthorizations.revocationReason,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(revoked.status).toBe("revoked");
        expect(revoked.reviewReason).toMatch(/Independent verification/);
        expect(revoked.revocationReason).toMatch(/withdrew/);
        const audit=await tx.select({action:s.auditEvents.action})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,authorizationId));
        expect(audit.map(x=>x.action)).toEqual(expect.arrayContaining([
          "program.site.authorization.request",
          "program.site.authorization.review",
          "program.site.authorization.revoke",
        ]));
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },300_000);
});

integration("Program-Site authorization denial, windows, cross-tenant and CAN revocation guards", () => {
  async function createAuthorizationFixture(tx: Transaction, suffix: string) {
    const s = await import("@/db/schema");
    const { startProgramLaunch } = await import("@/modules/programs/program-launch-service");
    const [can, otherCan, church, other] = await Promise.all([
      tx.insert(s.organizations).values({
        type:"can_network", name:"CAN Guard " + suffix, slug:"can-guard-"+suffix,
      }).returning(),
      tx.insert(s.organizations).values({
        type:"can_network", name:"Foreign CAN " + suffix, slug:"foreign-can-"+suffix,
      }).returning(),
      tx.insert(s.organizations).values({
        type:"church", name:"Guard Church " + suffix, slug:"guard-church-"+suffix,
      }).returning(),
      tx.insert(s.organizations).values({
        type:"church", name:"Guard Other Church " + suffix, slug:"guard-other-"+suffix,
      }).returning(),
    ]).then(rows=>rows.map(x=>x[0]!));
    const [site] = await tx.insert(s.sites).values({
      organizationId:church.id, name:"Guard Campus", slug:"guard-site-"+suffix,
      timezone:"America/Chicago",
    }).returning();
    const [jurisdiction] = await tx.insert(s.jurisdictions).values({
      code:"test-guard-"+suffix, name:"Synthetic guard jurisdiction",
    }).returning();
    const [hostPerson, stewardPerson, foreignPerson, verifierPerson] = await Promise.all([
      tx.insert(s.people).values({legalFirstName:"Guard",legalLastName:"Registrar"}).returning(),
      tx.insert(s.people).values({legalFirstName:"Guard",legalLastName:"Steward"}).returning(),
      tx.insert(s.people).values({legalFirstName:"Foreign",legalLastName:"Steward"}).returning(),
      tx.insert(s.people).values({legalFirstName:"Guard",legalLastName:"Verifier"}).returning(),
    ]).then(rows=>rows.map(x=>x[0]!));
    await tx.insert(s.journeyDefinitions).values({
      key:"program-launch", version:"guard-"+suffix,
      owningOrganizationId:can.id, audience:"partner", title:"Program launch",
      configuration:{requirements:[{key:"staffing",title:"Staffing",blocking:true,owner:"partner"}]},
    });
    const contextFor=(role:"registrar"|"can_network_steward",personId:string,orgId:string,siteId:string|null):AccessContext=>{
      const grant={id:crypto.randomUUID(),accountId:crypto.randomUUID(),personId,role,
        organizationId:orgId,siteId,active:true};
      return resolveAccessContext({
        accountId:grant.accountId,activeGrantId:grant.id,sessionId:"synthetic-rollback",
      },[grant]);
    };
    const host = contextFor("registrar",hostPerson.id,church.id,site!.id);
    const steward = contextFor("can_network_steward",stewardPerson.id,can.id,null);
    const foreignSteward = contextFor("can_network_steward",foreignPerson.id,otherCan.id,null);
    const unrelated = contextFor("registrar",hostPerson.id,other.id,null);
    const launch = await startProgramLaunch(host,{
      hostOrganizationId:church.id,siteId:site!.id,jurisdictionId:jurisdiction!.id,
      type:"church_hosted_academy",name:"Guard CAN Academy",
      slug:"guard-launch-"+suffix,
      gradeRange:{min:"9",max:"12"},
      deliveryModel:{onsite:true,asynchronous:true,onsiteDaysPerWeek:2},
      academicProviderOrganizationId:can.id,
      creditIssuingOrganizationId:can.id,
      creditMode:"credit_bearing",
    });
    host.scope.programIds=[launch.programId];
    const services=[
      "academic_instruction","academic_records","onsite_supervision",
      "school_of_record","credit_issuance","admissions","curriculum",
    ];
    const agreementEvidence=async(expiresAt?:Date)=>{
      const [doc]=await tx.insert(s.documents).values({
        subjectType:"program",subjectId:launch.programId,
        category:"program_site_operating_agreement",fileName:"guard-signed.pdf",
        storageProvider:"synthetic-test",
        storageKey:"guard-approved-"+suffix+"-"+crypto.randomUUID().slice(0,8),
        uploadedByPersonId:hostPerson.id,
        verifiedAt:new Date(Date.now()-3600000),verifiedByPersonId:verifierPerson.id,
        ...(expiresAt?{expiresAt}:{}),
        metadata:{
          hostOrganizationId:church.id,institutionOrganizationId:can.id,
          siteId:site!.id,creditIssuingOrganizationId:can.id,
          hostSignatureVerified:true,institutionSignatureVerified:true,
          authorizedServices:services,
        },
      }).returning();
      return doc!;
    };
    return {
      can,church,site,services,launch,host,steward,foreignSteward,unrelated,
      hostPerson,stewardPerson,agreementEvidence,
    };
  }

  it("denies a request with event and audit, fails closed, then allows a new-version re-request", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-denial");
    let complete = false;
    let deniedId = "";
    let replacementId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { asc, eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          revokeProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
          getHostProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        deniedId=requested.authorizationId;
        await expect(reviewProgramSiteAuthorization(f.steward,{
          authorizationId:deniedId,decision:"denied",
          reason:"The submitted agreement evidence could not be independently verified.",
        })).resolves.toEqual({authorizationId:deniedId,status:"denied"});
        const [deniedRow]=await tx.select({
          status:s.programSiteAuthorizations.status,
          reviewReason:s.programSiteAuthorizations.reviewReason,
          reviewedByPersonId:s.programSiteAuthorizations.reviewedByPersonId,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,deniedId));
        expect(deniedRow).toMatchObject({
          status:"denied",reviewedByPersonId:f.stewardPerson.id,
        });
        expect(deniedRow!.reviewReason).toMatch(/could not be independently verified/);
        const denialAudit=await tx.select({action:s.auditEvents.action})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,deniedId));
        expect(denialAudit.map(x=>x.action)).toEqual(expect.arrayContaining([
          "program.site.authorization.request",
          "program.site.authorization.review",
        ]));
        const denialEvents=await tx.select({eventType:s.domainEvents.eventType})
          .from(s.domainEvents).where(eq(s.domainEvents.aggregateId,deniedId));
        expect(denialEvents.map(x=>x.eventType)).toEqual(expect.arrayContaining([
          "ProgramSiteAuthorizationRequested",
          "ProgramSiteAuthorizationDenied",
        ]));
        // A denied agreement grants no operating authority.
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        expect((await getHostProgramSiteAuthorization(f.host,f.launch.programId))
          .authorization?.status).toBe("denied");
        // Race guards on the terminal denied row.
        await expect(reviewProgramSiteAuthorization(f.steward,{
          authorizationId:deniedId,decision:"denied",
          reason:"A denied request cannot be reviewed a second time.",
        })).rejects.toThrow(
          "Authorization request already reviewed; use the revocation or new-version workflow");
        await expect(revokeProgramSiteAuthorization(f.steward,{
          authorizationId:deniedId,reason:"A denied request was never approved authority.",
        })).rejects.toThrow("Only a currently approved or suspended authorization can be revoked");
        // The host may submit a corrected replacement as a NEW version; the
        // denied row remains preserved as decision history.
        const replacement=await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        replacementId=replacement.authorizationId;
        expect(replacement).toMatchObject({created:true,status:"requested"});
        expect(replacementId).not.toBe(deniedId);
        const versions=await tx.select({
          id:s.programSiteAuthorizations.id,
          version:s.programSiteAuthorizations.version,
          status:s.programSiteAuthorizations.status,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.programId,f.launch.programId))
          .orderBy(asc(s.programSiteAuthorizations.version));
        expect(versions).toEqual([
          {id:deniedId,version:1,status:"denied"},
          {id:replacementId,version:2,status:"requested"},
        ]);
        const hostStatus=await getHostProgramSiteAuthorization(f.host,f.launch.programId);
        expect(hostStatus.authorization).toMatchObject({id:replacementId,version:2,status:"requested"});
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {inArray}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(inArray(s.programSiteAuthorizations.id,[deniedId,replacementId]))).toHaveLength(0);
  },120_000);

  it("fails closed while an approved authorization's effective window has not yet opened", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-window");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          requireCurrentProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        const evidence=await f.agreementEvidence();
        const futureFrom=new Date(Date.now()+86400000);
        const through=new Date(Date.now()+86400000*180);
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"Approved with a future start date for the coming term.",
          evidenceDocumentId:evidence.id,effectiveFrom:futureFrom,effectiveThrough:through,
        });
        const [row]=await tx.select({status:s.programSiteAuthorizations.status})
          .from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(row!.status).toBe("approved");
        // Approved, but NOT yet effective: every dependent authority read must
        // fail closed until the contractual window actually opens.
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        // Once the window opens the same approved row becomes authoritative.
        await tx.update(s.programSiteAuthorizations).set({
          effectiveFrom:new Date(Date.now()-1000),
        }).where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(await requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction","onsite_supervision",
        ])).toBe(authorizationId);
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },120_000);

  it("rejects cross-tenant review, revocation and host-projection reads without changing state", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-cross-tenant");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          revokeProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
          getHostProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        const evidence=await f.agreementEvidence();
        const from=new Date(Date.now()-3600000);
        const through=new Date(Date.now()+86400000*180);
        // An unrelated church's registrar and a steward scoped to a DIFFERENT
        // CAN network are not this agreement's institutional reviewer.
        await expect(reviewProgramSiteAuthorization(f.unrelated,{
          authorizationId,decision:"approved",
          reason:"Another church must never review this agreement.",
          evidenceDocumentId:evidence.id,effectiveFrom:from,effectiveThrough:through,
        })).rejects.toThrow("separate CAN institutional reviewer");
        await expect(reviewProgramSiteAuthorization(f.foreignSteward,{
          authorizationId,decision:"denied",
          reason:"A foreign CAN network must never decide this agreement.",
        })).rejects.toThrow("separate CAN institutional reviewer");
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"The contracting CAN network independently verifies both parties.",
          evidenceDocumentId:evidence.id,effectiveFrom:from,effectiveThrough:through,
        });
        await expect(revokeProgramSiteAuthorization(f.unrelated,{
          authorizationId,reason:"Another church must never revoke this agreement.",
        })).rejects.toThrow("verified church-host registrar for this Program and Site");
        await expect(revokeProgramSiteAuthorization(f.foreignSteward,{
          authorizationId,reason:"A foreign CAN network must never revoke this agreement.",
        })).rejects.toThrow("separate CAN institutional reviewer");
        // The host workspace projection is limited to the hosting registrar.
        await expect(getHostProgramSiteAuthorization(f.steward,f.launch.programId))
          .rejects.toThrow("host registrar Program and Site scope");
        await expect(getHostProgramSiteAuthorization(f.unrelated,f.launch.programId))
          .rejects.toThrow("host registrar Program and Site scope");
        // Failed cross-tenant attempts leave the approved authority untouched.
        expect(await requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction","school_of_record",
        ])).toBe(authorizationId);
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },120_000);

  it.each([
    ["host", "approved"], ["steward", "approved"],
    ["host", "suspended"], ["steward", "suspended"],
  ] as const)("supports %s revocation of %s authority with history and a fresh replacement", async (revoker, status) => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-can-revocation");
    let complete = false;
    let revokedId = "";
    let replacementId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { asc, eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          revokeProgramSiteAuthorization, suspendProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        revokedId=requested.authorizationId;
        // Race guard: a merely requested (never approved) row cannot be revoked.
        await expect(revokeProgramSiteAuthorization(f[revoker],{
          authorizationId:revokedId,reason:"A pending request is not approved authority.",
        })).rejects.toThrow("Only a currently approved or suspended authorization can be revoked");
        const evidence=await f.agreementEvidence();
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId:revokedId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:evidence.id,
          effectiveFrom:new Date(Date.now()-3600000),
          effectiveThrough:new Date(Date.now()+86400000*180),
        });
        // Race guard: an already-reviewed request cannot be reviewed again.
        await expect(reviewProgramSiteAuthorization(f.steward,{
          authorizationId:revokedId,decision:"denied",
          reason:"An approved authorization cannot be re-reviewed.",
        })).rejects.toThrow(
          "Authorization request already reviewed; use the revocation or new-version workflow");
        await expect(requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        })).rejects.toThrow("Revoke the current authorization before requesting a replacement");
        if (status === "suspended") await suspendProgramSiteAuthorization(f.steward,{
          authorizationId:revokedId,reason:"CAN paused services for an independent compliance review.",
        });
        await expect(revokeProgramSiteAuthorization(f.unrelated,{
          authorizationId:revokedId,reason:"An unrelated church cannot withdraw this agreement.",
        })).rejects.toThrow("verified church-host registrar");
        await expect(revokeProgramSiteAuthorization(f.foreignSteward,{
          authorizationId:revokedId,reason:"Another CAN network cannot withdraw this agreement.",
        })).rejects.toThrow("separate CAN institutional reviewer");
        // Either contracting party can withdraw without first restoring services.
        await expect(revokeProgramSiteAuthorization(f[revoker],{
          authorizationId:revokedId,
          reason:"CAN withdrew the operating relationship for this school.",
        })).resolves.toEqual({authorizationId:revokedId,status:"revoked"});
        const [revoked]=await tx.select({
          status:s.programSiteAuthorizations.status,
          revokedByPersonId:s.programSiteAuthorizations.revokedByPersonId,
          revocationReason:s.programSiteAuthorizations.revocationReason,
          suspendedByPersonId:s.programSiteAuthorizations.suspendedByPersonId,
          suspendedAt:s.programSiteAuthorizations.suspendedAt,
          suspensionReason:s.programSiteAuthorizations.suspensionReason,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,revokedId));
        expect(revoked).toMatchObject({
          status:"revoked",revokedByPersonId:f[revoker].actorPersonId,
          suspendedByPersonId:null,suspendedAt:null,suspensionReason:null,
        });
        expect(revoked!.revocationReason).toMatch(/CAN withdrew/);
        const revocationAudit=await tx.select({action:s.auditEvents.action,before:s.auditEvents.before})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,revokedId));
        expect(revocationAudit.map(x=>x.action)).toEqual(expect.arrayContaining([
          "program.site.authorization.request",
          "program.site.authorization.review",
          "program.site.authorization.revoke",
        ]));
        expect(revocationAudit.find(x=>x.action==="program.site.authorization.revoke")?.before)
          .toMatchObject({status, suspensionReason:status === "suspended"
            ? "CAN paused services for an independent compliance review." : null});
        const revocationEvents=await tx.select({eventType:s.domainEvents.eventType})
          .from(s.domainEvents).where(eq(s.domainEvents.aggregateId,revokedId));
        expect(revocationEvents.map(x=>x.eventType)).toEqual(expect.arrayContaining([
          "ProgramSiteAuthorizationApproved",
          "ProgramSiteAuthorizationRevoked",
        ]));
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        // After revocation the host may contract a fresh version; the revoked
        // row remains preserved as history.
        const replacement=await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        replacementId=replacement.authorizationId;
        expect(replacement).toMatchObject({created:true,status:"requested"});
        const versions=await tx.select({
          id:s.programSiteAuthorizations.id,
          version:s.programSiteAuthorizations.version,
          status:s.programSiteAuthorizations.status,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.programId,f.launch.programId))
          .orderBy(asc(s.programSiteAuthorizations.version));
        expect(versions).toEqual([
          {id:revokedId,version:1,status:"revoked"},
          {id:replacementId,version:2,status:"requested"},
        ]);
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {inArray}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(inArray(s.programSiteAuthorizations.id,[revokedId,replacementId]))).toHaveLength(0);
  },120_000);

  it("suspends an approved authorization fail-closed with audit and event, and blocks a new version request", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-suspension");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          suspendProgramSiteAuthorization, resumeProgramSiteAuthorization,
          requireCurrentProgramSiteAuthorization, getHostProgramSiteAuthorization,
          listCANOperatingAuthorizationDesk,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        // Race guard: a merely requested (never approved) row cannot be suspended.
        await expect(suspendProgramSiteAuthorization(f.steward,{
          authorizationId,reason:"A pending request is not approved authority.",
        })).rejects.toThrow("Only a currently approved authorization can be suspended");
        const evidence=await f.agreementEvidence();
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:evidence.id,
          effectiveFrom:new Date(Date.now()-3600000),
          effectiveThrough:new Date(Date.now()+86400000*180),
        });
        // Race guard: a non-suspended row cannot be resumed.
        await expect(resumeProgramSiteAuthorization(f.steward,{
          authorizationId,reason:"An approved authorization was never suspended.",
        })).rejects.toThrow("Only a currently suspended authorization can be resumed");
        // The host church cannot suspend; its withdrawal remedy is revocation.
        await expect(suspendProgramSiteAuthorization(f.host,{
          authorizationId,reason:"A host church must never suspend this agreement.",
        })).rejects.toThrow("separate CAN institutional reviewer");
        // A steward scoped to a DIFFERENT CAN network cannot suspend either.
        await expect(suspendProgramSiteAuthorization(f.foreignSteward,{
          authorizationId,reason:"A foreign CAN network must never suspend this agreement.",
        })).rejects.toThrow("separate CAN institutional reviewer");
        // The requesting person can never suspend their own request, even with
        // a CAN steward role on the contracting institution.
        const selfGrant={id:crypto.randomUUID(),accountId:crypto.randomUUID(),
          personId:f.hostPerson.id,role:"can_network_steward" as const,
          organizationId:f.can.id,siteId:null,active:true};
        const selfSteward=resolveAccessContext({
          accountId:selfGrant.accountId,activeGrantId:selfGrant.id,sessionId:"synthetic-rollback",
        },[selfGrant]);
        await expect(suspendProgramSiteAuthorization(selfSteward,{
          authorizationId,reason:"The requester must never suspend their own agreement.",
        })).rejects.toThrow("independent reviewer");
        // Failed attempts leave the approved authority fully usable.
        expect(await requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction","school_of_record",
        ])).toBe(authorizationId);
        await expect(suspendProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"CAN paused delegated operations pending a compliance review.",
        })).resolves.toEqual({authorizationId,status:"suspended"});
        // Suspension fails every dependent read closed immediately.
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        const [suspended]=await tx.select({
          status:s.programSiteAuthorizations.status,
          suspendedByPersonId:s.programSiteAuthorizations.suspendedByPersonId,
          suspendedAt:s.programSiteAuthorizations.suspendedAt,
          suspensionReason:s.programSiteAuthorizations.suspensionReason,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(suspended).toMatchObject({
          status:"suspended",suspendedByPersonId:f.stewardPerson.id,
          suspendedAt:expect.any(Date),
        });
        expect(suspended!.suspensionReason).toMatch(/compliance review/);
        const suspensionAudit=await tx.select({action:s.auditEvents.action})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,authorizationId));
        expect(suspensionAudit.map(x=>x.action)).toEqual(expect.arrayContaining([
          "program.site.authorization.request",
          "program.site.authorization.review",
          "program.site.authorization.suspended",
        ]));
        const suspensionEvents=await tx.select({eventType:s.domainEvents.eventType})
          .from(s.domainEvents).where(eq(s.domainEvents.aggregateId,authorizationId));
        expect(suspensionEvents.map(x=>x.eventType)).toEqual(expect.arrayContaining([
          "ProgramSiteAuthorizationApproved",
          "ProgramSiteAuthorizationSuspended",
        ]));
        // A suspended row still occupies the current-version slot: the host
        // cannot request a replacement until it is resumed or revoked.
        await expect(requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        })).rejects.toThrow("Revoke the current authorization before requesting a replacement");
        // A domain denial must not abort the transaction or mutate history.
        const unchanged=await tx.select({
          id:s.programSiteAuthorizations.id,status:s.programSiteAuthorizations.status,
          version:s.programSiteAuthorizations.version,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.programId,f.launch.programId));
        expect(unchanged).toEqual([{id:authorizationId,status:"suspended",version:1}]);
        expect((await getHostProgramSiteAuthorization(f.host,f.launch.programId)).authorization)
          .toMatchObject({status:"suspended",lapsed:false,
            suspensionReason:"CAN paused delegated operations pending a compliance review."});
        // Expiry is independent of suspension: both conditions must be visible.
        await tx.update(s.programSiteAuthorizations).set({effectiveThrough:new Date(Date.now()-1000)})
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect((await getHostProgramSiteAuthorization(f.host,f.launch.programId)).authorization)
          .toMatchObject({status:"suspended",lapsed:true});
        expect((await listCANOperatingAuthorizationDesk(f.steward)).authorizations
          .find(row=>row.id===authorizationId)).toMatchObject({status:"suspended",lapsed:true});
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },120_000);

  it("resumes a suspended authorization without extending its window, with audit and event", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-resumption");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          suspendProgramSiteAuthorization, resumeProgramSiteAuthorization,
          requireCurrentProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        const evidence=await f.agreementEvidence();
        const through=new Date(Date.now()+86400000*180);
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:evidence.id,
          effectiveFrom:new Date(Date.now()-3600000),effectiveThrough:through,
        });
        await suspendProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"CAN paused delegated operations pending a compliance review.",
        });
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        await expect(resumeProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"The compliance review closed; operations may resume.",
        })).resolves.toEqual({authorizationId,status:"approved"});
        // The same approved row is authoritative again, with no window change.
        expect(await requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction","onsite_supervision",
        ])).toBe(authorizationId);
        const [resumed]=await tx.select({
          status:s.programSiteAuthorizations.status,
          suspendedByPersonId:s.programSiteAuthorizations.suspendedByPersonId,
          suspendedAt:s.programSiteAuthorizations.suspendedAt,
          suspensionReason:s.programSiteAuthorizations.suspensionReason,
          effectiveThrough:s.programSiteAuthorizations.effectiveThrough,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(resumed).toMatchObject({
          status:"approved",suspendedByPersonId:null,suspendedAt:null,
          suspensionReason:null,
        });
        expect(resumed!.effectiveThrough).toEqual(through);
        const resumptionAudit=await tx.select({action:s.auditEvents.action})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,authorizationId));
        expect(resumptionAudit.map(x=>x.action)).toEqual(expect.arrayContaining([
          "program.site.authorization.suspended",
          "program.site.authorization.resumed",
        ]));
        const resumptionEvents=await tx.select({eventType:s.domainEvents.eventType})
          .from(s.domainEvents).where(eq(s.domainEvents.aggregateId,authorizationId));
        expect(resumptionEvents.map(x=>x.eventType)).toEqual(expect.arrayContaining([
          "ProgramSiteAuthorizationSuspended",
          "ProgramSiteAuthorizationResumed",
        ]));
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },120_000);

  it("surfaces a lapsed approved row and the steward renews it under fresh evidence, idempotently", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-renewal");
    let complete = false;
    let authorizationId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          renewProgramSiteAuthorization, requireCurrentProgramSiteAuthorization,
          getHostProgramSiteAuthorization, listCANOperatingAuthorizationDesk,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        const evidence=await f.agreementEvidence();
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:evidence.id,
          effectiveFrom:new Date(Date.now()-3600000),
          effectiveThrough:new Date(Date.now()+86400000*180),
        });
        // Time passes: the approved row lapses but keeps status 'approved' and
        // its current-version slot; every dependent read fails closed.
        const lapsedThrough=new Date(Date.now()-1000);
        await tx.update(s.programSiteAuthorizations).set({effectiveThrough:lapsedThrough})
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        await expect(requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow("current independently verified CAN-church operating authority");
        expect((await listCANOperatingAuthorizationDesk(f.steward)).authorizations
          .find(x=>x.id===authorizationId)).toMatchObject({status:"approved",lapsed:true});
        expect((await getHostProgramSiteAuthorization(f.host,f.launch.programId))
          .authorization).toMatchObject({status:"approved",lapsed:true});
        // Renewal denials: the host registrar, a foreign CAN steward and the
        // requester wearing a steward role are never the renewing steward.
        const newThrough=new Date(Date.now()+86400000*365);
        const renewalEvidence=await f.agreementEvidence(
          new Date(newThrough.getTime()+86400000*30));
        const renew=(actor:AccessContext,overrides:Record<string,unknown>={})=>
          renewProgramSiteAuthorization(actor,{
            authorizationId,evidenceDocumentId:renewalEvidence.id,
            effectiveThrough:newThrough,
            reason:"CAN renewed the agreement under freshly verified evidence.",
            ...overrides,
          });
        await expect(renew(f.host)).rejects.toThrow("separate CAN institutional reviewer");
        await expect(renew(f.foreignSteward)).rejects.toThrow("separate CAN institutional reviewer");
        const selfGrant={id:crypto.randomUUID(),accountId:crypto.randomUUID(),
          personId:f.hostPerson.id,role:"can_network_steward" as const,
          organizationId:f.can.id,siteId:null,active:true};
        const selfSteward=resolveAccessContext({
          accountId:selfGrant.accountId,activeGrantId:selfGrant.id,sessionId:"synthetic-rollback",
        },[selfGrant]);
        await expect(renew(selfSteward)).rejects.toThrow("independent reviewer");
        // Evidence whose own expiry predates the renewed window is rejected.
        const shortEvidence=await f.agreementEvidence(
          new Date(newThrough.getTime()-86400000));
        await expect(renew(f.steward,{evidenceDocumentId:shortEvidence.id}))
          .rejects.toThrow("independently verified two-party operating agreement evidence");
        // A non-extending end date is rejected even for the lapsed row.
        await expect(renew(f.steward,{effectiveThrough:lapsedThrough})).rejects.toThrow(
          "Renewal requires a new future end date that extends the current agreement window");
        // The contracting steward renews the SAME row under fresh evidence.
        await expect(renew(f.steward)).resolves.toEqual({authorizationId,renewed:true});
        const [row]=await tx.select({
          status:s.programSiteAuthorizations.status,
          evidenceDocumentId:s.programSiteAuthorizations.evidenceDocumentId,
          effectiveThrough:s.programSiteAuthorizations.effectiveThrough,
          reviewedByPersonId:s.programSiteAuthorizations.reviewedByPersonId,
          reviewReason:s.programSiteAuthorizations.reviewReason,
          revokedAt:s.programSiteAuthorizations.revokedAt,
          suspendedAt:s.programSiteAuthorizations.suspendedAt,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.id,authorizationId));
        expect(row).toMatchObject({
          status:"approved",evidenceDocumentId:renewalEvidence.id,
          effectiveThrough:newThrough,reviewedByPersonId:f.stewardPerson.id,
          revokedAt:null,suspendedAt:null,
        });
        expect(row!.reviewReason).toMatch(/Independent verification/);
        // The renewed row is authoritative again and no longer reads lapsed.
        expect(await requireCurrentProgramSiteAuthorization(tx,f.launch.programId,[
          "academic_instruction","school_of_record",
        ])).toBe(authorizationId);
        expect((await listCANOperatingAuthorizationDesk(f.steward)).authorizations
          .find(x=>x.id===authorizationId)).toMatchObject({status:"approved",lapsed:false});
        expect((await getHostProgramSiteAuthorization(f.host,f.launch.programId))
          .authorization).toMatchObject({lapsed:false});
        // Replaying the identical renewal is a no-op without duplicate records.
        await expect(renew(f.steward)).resolves.toEqual({authorizationId,renewed:false});
        const audit=await tx.select({action:s.auditEvents.action})
          .from(s.auditEvents).where(eq(s.auditEvents.resourceId,authorizationId));
        expect(audit.map(x=>x.action).filter(a=>a==="program.site.authorization.renewed"))
          .toHaveLength(1);
        const events=await tx.select({eventType:s.domainEvents.eventType})
          .from(s.domainEvents).where(eq(s.domainEvents.aggregateId,authorizationId));
        expect(events.map(x=>x.eventType)
          .filter(e=>e==="ProgramSiteAuthorizationRenewed")).toHaveLength(1);
        // A later end date with the SAME evidence is a real second renewal,
        // while a non-extending end date with different evidence is rejected.
        await expect(renew(f.steward,{evidenceDocumentId:evidence.id}))
          .rejects.toThrow("extends the current agreement window");
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {eq}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(eq(s.programSiteAuthorizations.id,authorizationId))).toHaveLength(0);
  },120_000);

  it("rejects renewal from requested, denied, suspended and revoked statuses", async () => {
    const { db: realDb } = await vi.importActual<{ db: Database }>("@/db/client");
    const rollback = new Error("rollback-program-site-renewal-status");
    let complete = false;
    let authorizationId = "";
    let deniedId = "";
    try {
      await realDb.transaction(async tx => {
        state.tx = tx;
        const s = await import("@/db/schema");
        const { eq } = await import("drizzle-orm");
        const {
          requestProgramSiteAuthorization, reviewProgramSiteAuthorization,
          suspendProgramSiteAuthorization, resumeProgramSiteAuthorization,
          revokeProgramSiteAuthorization, renewProgramSiteAuthorization,
        } = await import("@/modules/programs/program-site-authorization.server");
        const suffix = crypto.randomUUID().slice(0,8);
        const f = await createAuthorizationFixture(tx,suffix);
        const requested = await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        authorizationId=requested.authorizationId;
        const evidence=await f.agreementEvidence();
        const newThrough=new Date(Date.now()+86400000*365);
        const renew=(id:string)=>renewProgramSiteAuthorization(f.steward,{
          authorizationId:id,evidenceDocumentId:evidence.id,effectiveThrough:newThrough,
          reason:"Renewal requires a currently approved authorization.",
        });
        await expect(renew(authorizationId)).rejects.toThrow(
          "Only a currently approved authorization can be renewed");
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId,decision:"approved",
          reason:"Independent verification of both contracting organizations.",
          evidenceDocumentId:evidence.id,
          effectiveFrom:new Date(Date.now()-3600000),
          effectiveThrough:new Date(Date.now()+86400000*180),
        });
        await suspendProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"CAN paused delegated operations pending a compliance review.",
        });
        await expect(renew(authorizationId)).rejects.toThrow(
          "Only a currently approved authorization can be renewed");
        await resumeProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"The compliance review closed; operations may resume.",
        });
        await revokeProgramSiteAuthorization(f.steward,{
          authorizationId,
          reason:"CAN withdrew the operating relationship for this school.",
        });
        await expect(renew(authorizationId)).rejects.toThrow(
          "Only a currently approved authorization can be renewed");
        // A denied replacement request is equally not renewable.
        const replacement=await requestProgramSiteAuthorization(f.host,{
          programId:f.launch.programId,services:f.services,
        });
        deniedId=replacement.authorizationId;
        await reviewProgramSiteAuthorization(f.steward,{
          authorizationId:deniedId,decision:"denied",
          reason:"The submitted agreement evidence could not be independently verified.",
        });
        await expect(renew(deniedId)).rejects.toThrow(
          "Only a currently approved authorization can be renewed");
        // Every failed renewal left the terminal states untouched.
        const rows=await tx.select({
          id:s.programSiteAuthorizations.id,status:s.programSiteAuthorizations.status,
          effectiveThrough:s.programSiteAuthorizations.effectiveThrough,
        }).from(s.programSiteAuthorizations)
          .where(eq(s.programSiteAuthorizations.programId,f.launch.programId));
        expect(rows.find(x=>x.id===authorizationId)).toMatchObject({status:"revoked"});
        expect(rows.find(x=>x.id===deniedId)).toMatchObject({
          status:"denied",effectiveThrough:null,
        });
        complete=true;
        throw rollback;
      });
    } catch(error) {
      if(error!==rollback)throw error;
    } finally {state.tx=undefined;}
    expect(complete).toBe(true);
    const s=await import("@/db/schema");
    const {inArray}=await import("drizzle-orm");
    expect(await realDb.select({id:s.programSiteAuthorizations.id})
      .from(s.programSiteAuthorizations)
      .where(inArray(s.programSiteAuthorizations.id,[authorizationId,deniedId]))).toHaveLength(0);
  },120_000);
});
