import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { resolveAccessContext } from "@/domain/access-context";
import type { AccessContext } from "@/domain/access-context";

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
          getHostProgramSiteAuthorization, listCANOperatingAuthorizationDesk,
        } = await import("@/modules/programs/program-site-authorization.server");
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
        const contextFor=(role:"registrar"|"can_network_steward",personId:string,orgId:string,siteId:string|null):AccessContext=>{
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
        const services=[
          "academic_instruction","onsite_supervision","school_of_record","credit_issuance",
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
          "academic_instruction","onsite_supervision","school_of_record","credit_issuance",
        ])).toBe(authorizationId);
        await expect(requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "admissions",
        ])).rejects.toThrow();
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
        await expect(requireCurrentProgramSiteAuthorization(tx,launch.programId,[
          "academic_instruction",
        ])).rejects.toThrow();
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
