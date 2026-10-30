import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { and, eq } from "drizzle-orm";
import { roleCapabilities } from "@/domain/access-context";
import type { AccessContext } from "@/domain/access-context";

type Transaction=Parameters<Parameters<Database["transaction"]>[0]>[0];
const state=vi.hoisted(()=>({
  tx:undefined as Transaction|undefined,
  actor:undefined as AccessContext|undefined,
}));
vi.mock("@/db/client",()=>({
  get db(){
    if(!state.tx)throw new Error("Public family acceptance must remain inside disposable rollback transaction");
    return state.tx;
  },
}));
vi.mock("@tanstack/react-start",()=>({
 createServerFn:()=>({
  parse:(value:unknown)=>value,
  validator(parse:(value:unknown)=>unknown){this.parse=parse;return this;},
  handler(callback:(input:{data:unknown})=>unknown){
   return async(input?:{data:unknown})=>callback({data:this.parse(input?.data)});
  },
 }),
}));
vi.mock("@tanstack/react-start/server",()=>({
  getRequest:()=>new Request("https://app.can-os.com/guardian/apply"),
  setResponseHeader:vi.fn(),
}));
vi.mock("@/modules/identity/command-context.server",()=>({
 getCommandContext:async()=>{
  if(!state.actor)throw new Error("No independently authenticated parent");
  return state.actor;
 },
}));
const integration=process.env.DATABASE_URL?describe:describe.skip;
integration("real first-family publication to canonical application (rollback only)",()=>{
 it("proves published Site -> one-use email link -> scoped guardian -> pending canonical Application -> resume",async()=>{
  const {db:database}=await vi.importActual<{db:Database}>("@/db/client");
  const s=await import("@/db/schema");
  const {requestPublicFamilyStart}=await import("@/modules/enrollment/public-family-start.server");
  const {redeemPublicFamilyStart}=await import("@/modules/enrollment/public-family-redeem.server");
  const {
    startGuardianFamilyApplication,getGuardianFamilyApplicationWorkspace,
  }=await import("@/modules/enrollment/guardian-family-applications.functions");
  const rollback=new Error("rollback-public-first-family");
  const suffix=crypto.randomUUID().slice(0,12);
  const email=`adult-${suffix}@example.org`;
  const pepper="synthetic-first-family-test-pepper-of-adequate-length";
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER",pepper);
  vi.stubEnv("CAN_ACCESS_PUBLIC_ORIGIN","https://app.can-os.com");
  let checked=false;
  try{
   await database.transaction(async tx=>{
    state.tx=tx;
    const [org]=await tx.insert(s.organizations).values({
      type:"christian_school",name:"Published School",slug:`family-${suffix}`,
    }).returning();
    const [jurisdiction]=await tx.insert(s.jurisdictions).values({
      code:`family-${suffix}`,name:"First-family testing",
    }).returning();
    const [site]=await tx.insert(s.sites).values({
      organizationId:org!.id,name:"Published Site",slug:`family-${suffix}`,
    }).returning();
    const journeyKey=`family-${suffix}`;
    const [program]=await tx.insert(s.programs).values({
      organizationId:org!.id,siteId:site!.id,jurisdictionId:jurisdiction!.id,
      type:"full_school",status:"active",name:"Published High School",
      slug:`family-${suffix}`,gradeRange:{min:"9",max:"12"},
      deliveryModel:{onsite:true},academicProviderOrganizationId:org!.id,
      metadata:{enrollmentJourneyDefinitionKey:journeyKey},
    }).returning();
    await tx.insert(s.journeyDefinitions).values({
      key:journeyKey,version:"1",owningOrganizationId:org!.id,title:"Family enrollment review",
      audience:"family",configuration:{requirements:[{
        key:"verified_review",title:"Independent guardian review",blocking:true,owner:"can",
      }]},
    });
    await tx.insert(s.sitePublications).values({
      siteId:site!.id,slug:`family-${suffix}`,status:"published",publishedAt:new Date(),
    });
    await tx.insert(s.programPublications).values({
      siteId:site!.id,programId:program!.id,status:"published",
      title:"Published High School",summary:"Family intake at an active school.",
      gradeRange:{min:"9",max:"12"},
      deliveryModel:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:5},
      publishedAt:new Date(),
    });
    let link="";
    const request={
      requestId:crypto.randomUUID(),programId:program!.id,
      firstName:"Verified",lastName:"Adult",email,contactConsent:"yes" as const,website:"",
    };
    await requestPublicFamilyStart(`family-${suffix}`,request,async msg=>{
      expect(msg.to).toBe(email);
      link=msg.accessUrl;
    });
    expect(link).toContain("/family/join#token=");
    const token=new URL(link).hash.slice("#token=".length);
    const redeemed=await redeemPublicFamilyStart(token);
    expect(redeemed.programId).toBe(program!.id);
    await expect(redeemPublicFamilyStart(token)).rejects.toThrow("valid unexpired single-use");
    const [account]=await tx.select().from(s.accessAccounts)
      .where(eq(s.accessAccounts.emailNormalized,email)).limit(1);
    expect(account?.emailVerifiedAt).toBeInstanceOf(Date);
    const [grant]=await tx.select().from(s.accountPersonGrants)
      .where(and(eq(s.accountPersonGrants.accountId,account!.id),
        eq(s.accountPersonGrants.role,"guardian"))).limit(1);
    expect(grant).toMatchObject({
      organizationId:org!.id,siteId:site!.id,active:true,isSynthetic:false,
    });
    state.actor={
      accountId:account!.id,sessionId:crypto.randomUUID(),grantId:grant!.id,
      grantSiteId:site!.id,actorPersonId:grant!.personId,role:"guardian",
      capabilities:new Set(roleCapabilities.guardian),
      scope:{organizationIds:[org!.id],siteIds:[site!.id],programIds:[program!.id]},
    };
    const submission={requestId:crypto.randomUUID(),programId:program!.id,
      studentFirstName:"Prospective",studentLastName:"Learner",gradeLevel:"9"};
    const first=await startGuardianFamilyApplication({data:submission});
    const retry=await startGuardianFamilyApplication({data:submission});
    expect(retry.applicationId).toBe(first.applicationId);
    const [app]=await tx.select().from(s.applications)
      .where(eq(s.applications.id,first.applicationId)).limit(1);
    expect(app).toMatchObject({
      programId:program!.id,stage:"application",submittedByPersonId:grant!.personId,
    });
    const [profile]=await tx.select().from(s.studentProfiles)
      .where(eq(s.studentProfiles.id,app!.studentProfileId)).limit(1);
    const [relationship]=await tx.select().from(s.guardianRelationships)
      .where(and(eq(s.guardianRelationships.studentPersonId,profile!.personId),
        eq(s.guardianRelationships.guardianPersonId,grant!.personId))).limit(1);
    expect(relationship).toMatchObject({
      canViewAcademics:false,canManageEnrollment:false,
      canSubmitAttendanceExcuse:false,
      metadata:{verification:"pending",source:"authenticated_guardian_application"},
    });
    const workspace=await getGuardianFamilyApplicationWorkspace();
    expect(workspace.applications).toEqual(expect.arrayContaining([
      expect.objectContaining({applicationId:first.applicationId,guardianVerified:false}),
    ]));
    expect(workspace.households).toHaveLength(1);
    checked=true;
    throw rollback;
   });
  }catch(error){if(error!==rollback)throw error;}
  finally{state.tx=undefined;state.actor=undefined;vi.unstubAllEnvs();}
  expect(checked).toBe(true);
 });
});
