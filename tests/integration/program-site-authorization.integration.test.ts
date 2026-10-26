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
        const { eq } = await import("drizzle-orm");
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
        const renewed=await delegateCANAcademicProgramStaff(steward,staffCommand);
        expect(renewed.created).toBe(true);
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
        await tx.insert(s.sectionTeachers).values([
          {sectionId:section!.id,personId:localPerson.id},
          {sectionId:section!.id,personId:canPerson.id},
        ]);
        const teacherDelegation=await delegateCANAcademicProgramStaff(steward,{
          programId:launch.programId,personId:canPerson.id,role:"teacher",
          reason:"CAN delegates instruction for this exact contracted Program.",
        });
        const {staffedPublishedSectionIds}=await import(
          "@/modules/enrollment/instructional-section-readiness.server");
        const {verifiedTeacherSectionIds}=await import(
          "@/modules/enrollment/verified-section-teachers.server");
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(true);
        await tx.update(s.accountPersonGrants).set({active:false})
          .where(eq(s.accountPersonGrants.id,canGrant.id));
        // Even with an active host local teacher assignment, no CAN teacher
        // means enrollment cannot claim an actually staffed academic class.
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
        expect((await accessibleClasses(localTeacher as Actor)).map(x=>x.id))
          .not.toContain(section!.id);
        // Revoke ONLY the Program delegation. Keep the contract, verified
        // CAN account and historical Section assignment intact. Even an older
        // authenticated context must immediately lose this teaching access.
        expect((await staffedPublishedSectionIds([section!.id],tx)).has(section!.id)).toBe(true);
        await revokeCANAcademicProgramStaff(steward,{
          roleAssignmentId:teacherDelegation.roleAssignmentId,
          reason:"CAN withdraws this instructor from the contracted Program.",
        });
        expect((await verifiedTeacherSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        expect((await staffedPublishedSectionIds([section!.id],tx)).has(section!.id)).toBe(false);
        await expect(authorizeClass(canTeacher as Actor,section!.id))
          .rejects.toThrow("current provider-owned teacher Program delegation");
        expect(await accessibleClasses(canTeacher as Actor)).toEqual([]);
        // Restore through the canonical command for the remaining agreement tests.
        await delegateCANAcademicProgramStaff(steward,{
          programId:launch.programId,personId:canPerson.id,role:"teacher",
          reason:"CAN restores instruction for the remaining acceptance checks.",
        });
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
  },120_000);
});
