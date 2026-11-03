import {describe,expect,it,vi} from "vitest";
import {and,eq} from "drizzle-orm";
import type {Database} from "@/db/client";
import type {AccessContext} from "@/domain/access-context";
import {roleCapabilities} from "@/domain/access-context";

type Tx=Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({tx:undefined as Tx|undefined}));
vi.mock("@/db/client",()=>({
  get db(){if(!state.tx)throw new Error("Disposable rollback transaction required");
    return state.tx;},
}));
const integration=process.env.DATABASE_URL?describe:describe.skip;

integration("school jurisdiction material-change lifecycle (rollback only)",()=>{
  it("persists reviewer/Action/evidence decisions, then blocks old authority on a Site move",async()=>{
    const {db:realDb}=await vi.importActual<{db:Database}>("@/db/client");
    const s=await import("@/db/schema");
    const {readSchoolJurisdictionReview}=await import(
      "@/modules/programs/school-jurisdiction-review.server");
    const {ensureSchoolJurisdictionReviewAction,decideSchoolJurisdictionLegalReview}
      =await import("@/modules/programs/school-jurisdiction-actions.server");
    const {submitSchoolJurisdictionRequirementEvidence,
      decideSchoolJurisdictionRequirementEvidence}
      =await import("@/modules/programs/school-jurisdiction-evidence.server");
    const {requireCurrentSchoolJurisdictionForOpening}=await import(
      "@/modules/programs/school-jurisdiction-opening-gate.server");
    const rollback=new Error("jurisdiction-acceptance-rollback");
    let exercised=false;
    try{await realDb.transaction(async tx=>{
      state.tx=tx;
      const id=crypto.randomUUID();
      const now=new Date(),past=new Date(now.getTime()-24*3600_000);
      const future=new Date(now.getTime()+365*86400_000);
      const currentYear=now.getUTCFullYear();
      const [church]=await tx.insert(s.organizations).values({
        name:"Synthetic church",slug:"jurisdiction-church-"+id,type:"church",
      }).returning();
      const [can]=await tx.insert(s.organizations).values({
        name:"Synthetic CAN",slug:"jurisdiction-can-"+id,type:"can_network",
      }).returning();
      const [site]=await tx.insert(s.sites).values({
        organizationId:church!.id,name:"Synthetic school Site",slug:id,
        address:{street1:"100 First Street",city:"Oakland",state:"CA",
          postalCode:"94612",country:"US",county:"Alameda"},
      }).returning();
      const [jurisdiction]=await tx.insert(s.jurisdictions).values({
        code:"US-CA-"+id, // intentionally invalid until assigned code is reconciled
        name:"Synthetic California jurisdiction",
      }).returning();
      // The real canonical jurisdiction is a fixed US state code; update the
      // synthetic row before any C applicability evaluation.
      await tx.update(s.jurisdictions).set({code:"US-CA"})
        .where(eq(s.jurisdictions.id,jurisdiction!.id));
      const two=await tx.insert(s.programs).values(["elementary","enrichment"].map((name,i)=>({
        organizationId:church!.id,siteId:site!.id,jurisdictionId:jurisdiction!.id,
        hostOrganizationId:church!.id,academicProviderOrganizationId:can!.id,
        name,slug:id+"-"+name,type:i===0?"full_school" as const:"enrichment" as const,
        status:"active" as const,gradeRange:{min:"K",max:"K"},
        deliveryModel:{onsite:true},
        metadata:{jurisdictionOperatingModel:"church-hosted",
          jurisdictionResponsibleEntity:"school_of_record"},
      }))).returning();
      const [registrarPerson,reviewerPerson,editorPerson,documentVerifier]
        =await tx.insert(s.people).values(["registrar","CAN reviewer","editor","document verifier"].map(name=>({
          legalFirstName:"Synthetic",legalLastName:name,
        }))).returning();
      const host:AccessContext={role:"registrar",actorPersonId:registrarPerson!.id,
        grantSiteId:site!.id,sessionId:id,accountId:id,grantId:id,
        capabilities:new Set(roleCapabilities.registrar),
        scope:{organizationIds:[church!.id],siteIds:[site!.id],programIds:two.map(x=>x.id)}};
      const reviewer:AccessContext={role:"can_jurisdiction_reviewer",
        actorPersonId:reviewerPerson!.id,grantSiteId:null,
        sessionId:id,accountId:id,grantId:id,
        capabilities:new Set(roleCapabilities.can_jurisdiction_reviewer),
        scope:{organizationIds:[can!.id]}};
      const officialUrl="https://www.cde.ca.gov/synthetic-policy-reference";
      const evidence=[{title:"Official education policy reference",url:officialUrl,
        authority:"California Department of Education",checkedAt:past.toISOString()}];
      const requirement={
        id:"school-notice",title:"Confirm required school notice",
        description:"Submit independently verified documentary school-notice evidence.",
        responsibleParty:"church",phase:"before_opening",category:"authorization",
        evidenceIds:[officialUrl],
        applicability:{states:["CA"],operatingModels:["church-hosted"],
          responsibleEntities:["school_of_record"],programTypes:["full_school"]},
      };
      const [profile]=await tx.insert(s.jurisdictionProfileVersions).values({
        jurisdictionId:jurisdiction!.id,revision:"synthetic-v1",status:"published",
        title:"Synthetic reviewed policy",summary:"Synthetic policy for acceptance",
        profile:{requirements:[requirement],fundingPrograms:[]},evidence,
        effectiveAt:past,publishedAt:past,reviewedAt:past,nextReviewAt:future,
        verifiedByPersonId:reviewerPerson!.id,lastEditedByPersonId:editorPerson!.id,
        verificationStatus:"verified",
        verificationEvidence:{note:"Independently reviewed current official sources for the policy.",
          sources:evidence},
      }).returning();
      await tx.insert(s.jurisdictionProfileVerificationDecisions).values({
        profileVersionId:profile!.id,reviewerPersonId:reviewerPerson!.id,
        evidence:profile!.verificationEvidence,
      });
      const program=two[0]!;
      const [config]=await tx.insert(s.schoolConfigurationVersions).values({
        programId:program.id,version:1,deploymentModel:"church_hosted",
        status:"approved",approvedByPersonId:reviewerPerson!.id,approvedAt:past,
        effectiveFrom:past,
        config:{grades:{min:"K",max:"K"},
          delivery:{onsite:true,asynchronous:false,liveOnline:false},
          services:["school_of_record","academic_instruction","onsite_supervision"]},
      }).returning();
      const before=await readSchoolJurisdictionReview(host,program.id,tx);
      expect(before.policyReady).toBe(true);
      expect(before.reviewRequired).toBe(true); // no school-specific independent attestation
      await expect(requireCurrentSchoolJurisdictionForOpening(tx,program.id,{
        configurationCreatedAt:config!.createdAt,openingApprovedAt:config!.approvedAt,
      })).rejects.toThrow();
      expect((await ensureSchoolJurisdictionReviewAction(host,program.id)).created).toBe(true);
      const submitted=await readSchoolJurisdictionReview(reviewer,program.id,tx);
      await expect(decideSchoolJurisdictionLegalReview(host,{
        programId:program.id,expectedScopeFingerprint:submitted.scopeFingerprint,
        expectedSiteRevision:submitted.siteAddressRevision,decision:"verify",
        note:"Self review must not verify these school records.",sourceUrls:[officialUrl],
      })).rejects.toThrow();
      const accepted=await decideSchoolJurisdictionLegalReview(reviewer,{
        programId:program.id,expectedScopeFingerprint:submitted.scopeFingerprint,
        expectedSiteRevision:submitted.siteAddressRevision,decision:"verify",
        note:"Independently reviewed the current Site, program model and official policy source.",
        sourceUrls:[officialUrl],
      });
      expect(accepted.verified).toBe(true);
      expect((await ensureSchoolJurisdictionReviewAction(host,program.id)).needed).toBe(false);
      const [requirementAction]=await tx.select().from(s.actions).where(and(
        eq(s.actions.programId,program.id),
        eq(s.actions.type,"school_jurisdiction_requirement"))).limit(1);
      expect(requirementAction).toBeDefined();
      expect(requirementAction!.metadata.responsibleParty).toBe("church");
      await expect(requireCurrentSchoolJurisdictionForOpening(tx,program.id,{
        configurationCreatedAt:config!.createdAt,openingApprovedAt:config!.approvedAt,
      })).rejects.toThrow(); // legal attestation is NOT an opening evidence approval
      const [doc]=await tx.insert(s.documents).values({
        subjectType:"program",subjectId:program.id,category:"jurisdiction_requirement_evidence",
        fileName:"synthetic-filing.pdf",storageProvider:"cloudflare_r2",
        storageKey:"synthetic/"+id,uploadedByPersonId:registrarPerson!.id,
        verifiedAt:past,verifiedByPersonId:documentVerifier!.id,
        expiresAt:future,
        metadata:{siteId:site!.id,organizationId:church!.id,storageVerified:true},
      }).returning();
      expect((await submitSchoolJurisdictionRequirementEvidence(host,{
        actionId:requirementAction!.id,documentId:doc!.id,
        statement:"The church submitted a synthetic filing for CAN independent review.",
      })).submitted).toBe(true);
      expect((await decideSchoolJurisdictionRequirementEvidence(reviewer,{
        actionId:requirementAction!.id,decision:"verify",
        note:"Document was independently verified, scoped to this Site and current requirement.",
      })).verified).toBe(true);
      expect((await requireCurrentSchoolJurisdictionForOpening(tx,program.id,{
        configurationCreatedAt:config!.createdAt,openingApprovedAt:config!.approvedAt,
      })).jurisdictionProfileVersionId).toBe(profile!.id);
      // Agent S's persisted physical-address update and canonical review Action
      // are simulated here because S's unmerged branch is outside Agent C.
      const amendedAt=new Date(now.getTime()+3600_000);
      await tx.update(s.sites).set({address:{street1:"200 Second Street",city:"Oakland",
        state:"CA",postalCode:"94612",country:"US",county:"Alameda"},
        updatedAt:amendedAt}).where(eq(s.sites.id,site!.id));
      for(const attached of two){
        await tx.insert(s.actions).values({
          type:"site_location_change_review",status:"open",priority:"high",
          title:"Physical Site amendment requires independent review",
          subjectType:"program",subjectId:attached.id,
          organizationId:church!.id,siteId:site!.id,programId:attached.id,
          metadata:{reviewState:"needs_independent_review",
            siteAddressRevision:amendedAt.toISOString(),
            requestedByPersonId:registrarPerson!.id},
        });
      }
      const moved=await readSchoolJurisdictionReview(host,program.id,tx);
      expect(moved.reviewRequired).toBe(true);
      await expect(requireCurrentSchoolJurisdictionForOpening(tx,program.id,{
        configurationCreatedAt:config!.createdAt,openingApprovedAt:config!.approvedAt,
      })).rejects.toThrow();
      await expect(requireCurrentSchoolJurisdictionForOpening(tx,two[1]!.id,{
        configurationCreatedAt:config!.createdAt,openingApprovedAt:config!.approvedAt,
      })).rejects.toThrow();
      const audits=await tx.select().from(s.auditEvents).where(
        eq(s.auditEvents.action,"program.jurisdiction.independently_verified"));
      expect(audits.some(event=>event.entityId===accepted.actionId ||
        event.resourceId===accepted.actionId)).toBe(true);
      exercised=true;
      throw rollback;
    });}catch(error){if(error!==rollback)throw error;}
    finally{state.tx=undefined;}
    expect(exercised).toBe(true);
  });
});
