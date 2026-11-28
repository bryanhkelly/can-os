import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN, LOCAL_DEMO_ROOM_FACILITATOR, LOCAL_DEMO_RILEY_FACILITATOR } from "@/domain/local-demo-access";
import { readSessionGrants, readOwnerDelegationGrants } from "@/modules/identity/session-grants.server";
import { getCommandContext } from "@/modules/identity/command-context.server";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], select: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));
const student = LOCAL_DEMO_ACCOUNTS[0];
const studentGrant = {
  ...student, accountPersonId:student.personId,id: "student-grant", role: "student", active: true,
  organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
};
const adminGrant = {
  ...LOCAL_DEMO_ADMIN, accountPersonId:LOCAL_DEMO_ADMIN.personId, id: LOCAL_DEMO_ADMIN.grantId, role: "site_admin", active: true,
};
const valorBinding={organizationId:LOCAL_DEMO_ADMIN.organizationId,siteId:LOCAL_DEMO_ADMIN.siteId,
  enabled:true,ownerDomain:"valorschool.demo",siteOrganizationId:LOCAL_DEMO_ADMIN.organizationId};
beforeEach(() => {
  state.rows = [];
  vi.clearAllMocks();
  vi.stubEnv("CAN_ACCESS_TOKEN_PEPPER", "synthetic-session-isolation-key-at-least-32-characters");
  state.select.mockImplementation(() => {
    const query = {
      from: () => query, innerJoin: () => query, leftJoin: () => query,
      where: () => {
        const rows = Promise.resolve(state.rows.shift() ?? []);
        return Object.assign(rows, { limit: () => rows });
      },
    };
    return query;
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("public demo session isolation", () => {
  const facilitatorGrant = {
    ...LOCAL_DEMO_ROOM_FACILITATOR, accountPersonId:LOCAL_DEMO_ROOM_FACILITATOR.personId,id: LOCAL_DEMO_ROOM_FACILITATOR.grantId,
    role: "room_facilitator", active: true,
  };
  it("offers two separately verified grants to Riley with one immutable Person",async()=>{
    const primary={
      ...LOCAL_DEMO_RILEY_FACILITATOR,accountPersonId:LOCAL_DEMO_RILEY_FACILITATOR.personId,
      id:"fb000000-0000-4000-8000-000000000002",
      role:"teacher",active:true,
    };
    const facilitator={
      ...LOCAL_DEMO_RILEY_FACILITATOR,accountPersonId:LOCAL_DEMO_RILEY_FACILITATOR.personId,
      id:LOCAL_DEMO_RILEY_FACILITATOR.grantId,
      role:"room_facilitator",active:true,
    };
    state.rows=[[primary,facilitator],[valorBinding],[valorBinding]];
    expect(await readSessionGrants(primary.accountId,primary.email)).toEqual({
      grants:[primary,facilitator],demoAccountSwitching:false,
    });
  });
  it("accepts a current canonical replacement grant for the same Person and approved Site",async()=>{
    const grant={
      ...LOCAL_DEMO_RILEY_FACILITATOR,accountPersonId:LOCAL_DEMO_RILEY_FACILITATOR.personId,id:"replacement-grant",
      role:"room_facilitator",active:true,
    };
    state.rows=[[grant],[valorBinding]];
    expect((await readSessionGrants(grant.accountId,grant.email)).grants).toEqual([grant]);
  });
  it("gives Sally only her own room-facilitator workspace, not demo-admin switching", async () => {
    state.rows = [[facilitatorGrant],[valorBinding]];
    expect(await readSessionGrants(facilitatorGrant.accountId, facilitatorGrant.email)).toEqual({
      grants: [facilitatorGrant], demoAccountSwitching: false,
    });
  });
  it.each([{ role: "platform_owner" }, { role: "can_network_steward" }, { siteId: "foreign" },
    { organizationId: "foreign" }, { personId: "foreign" }, { accountId: "foreign" }])(
    "denies changed Valor facilitator identity %j", async change => {
      state.rows = [[{ ...facilitatorGrant, ...change }],[valorBinding]];
      expect((await readSessionGrants(facilitatorGrant.accountId, facilitatorGrant.email)).grants).toEqual([]);
    },
  );
  it("never includes a different Person in Admin switching", async () => {
    const riley={...LOCAL_DEMO_RILEY_FACILITATOR, accountPersonId:LOCAL_DEMO_RILEY_FACILITATOR.personId,
      id:LOCAL_DEMO_RILEY_FACILITATOR.grantId,
      role:"room_facilitator",active:true};
    state.rows=[[adminGrant],[valorBinding],[riley]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants)
      .toEqual([adminGrant]);
  });
  const school = {
    domain: "newschool.demo", organizationId: "new-organization", siteId: "new-site",
    adminAccountId: "new-account", adminPersonId: "new-person", adminGrantId: "new-grant",
    enabled: true, ownerDomain:"newschool.demo", siteOrganizationId: "new-organization",
  };
  const newGrant = {
    id: school.adminGrantId, accountId: school.adminAccountId, personId: school.adminPersonId,accountPersonId:school.adminPersonId,
    organizationId: school.organizationId, siteId: school.siteId, role: "site_admin", active: true,
    email: "admin.demo@newschool.demo",
  };
  it("resolves a newly provisioned demo administrator without enabling Valor delegation", async () => {
    state.rows = [[newGrant], [school]];
    expect(await readSessionGrants(newGrant.accountId, newGrant.email)).toEqual({
      grants: [newGrant], demoAccountSwitching: false, launchSiteId: school.siteId,
    });
  });
  it.each([
    { accountId: "foreign-account" }, { personId: "foreign-person" },
    { role: "platform_owner" }, { organizationId: "foreign-school" }, { siteId: "foreign-site" },
  ])("denies a newly issued demo session after identity changes %j", async change => {
    state.rows = [[{ ...newGrant, ...change }], [school]];
    expect((await readSessionGrants(newGrant.accountId, newGrant.email)).grants).toEqual([]);
  });
  it.each([
    { enabled: false }, { siteOrganizationId: "authentic-organization" },
  ])("retains the demo restriction after disablement or Site ownership changes %j", async change => {
    state.rows = [[{ ...newGrant, email: "ordinary@example.test" }], [{ ...school, ...change }]];
    expect((await readSessionGrants(newGrant.accountId, "ordinary@example.test")).grants).toEqual([]);
  });
  it.each([
    { accountId: "another-account" }, { personId: "another-person" },
    { role: "app_admin" }, { organizationId: "another-organization" },
    { siteId: "another-site" },
  ])("excludes a changed canonical student binding %j", async change => {
    state.rows = [[{ ...studentGrant, ...change }],[valorBinding]];
    expect((await readSessionGrants(student.accountId, student.email)).grants).toEqual([]);
  });
  it("keeps the administrator on their own canonical grant", async () => {
    const newStaff = {
      ...studentGrant, id:"new-person-grant", accountId:"new-person-account",
      personId:"new-person", accountPersonId:"new-person", role:"student",email:"student@valorschool.demo",
    };
    state.rows = [[adminGrant],[valorBinding],[studentGrant,newStaff]];
    const result=await readSessionGrants(LOCAL_DEMO_ADMIN.accountId,LOCAL_DEMO_ADMIN.email);
    expect(result).toEqual({
      grants:[adminGrant],
      demoAccountSwitching:false,
      launchSiteId:LOCAL_DEMO_ADMIN.siteId,
    });
  });
  it("projects only the delegated account, never its fixture switch targets", async () => {
    const ownerTarget = { ...adminGrant, accountPersonId: adminGrant.personId, emailVerifiedAt: null };
    state.rows = [[], [ownerTarget, studentGrant]];
    expect(await readOwnerDelegationGrants(ownerTarget.accountId, ownerTarget.personId, ownerTarget.email)).toEqual([ownerTarget]);
  });
  it("uses private credential memberships across Organizations without registry lookup", async () => {
    const first={...newGrant,privateCredential:true};
    const second={...first,id:"second-grant",organizationId:"another-org",siteId:"another-site",role:"teacher"};
    const protectedRole={...first,id:"protected-grant",role:"platform_owner",organizationId:null,siteId:null};
    state.rows=[[first,second,protectedRole],[]];
    expect((await readSessionGrants(first.accountId,first.email,undefined,"private_access_code")).grants).toEqual([first,second]);
    expect(state.select).toHaveBeenCalledTimes(2);
  });
  it.each([null,"email_link","local_demo_code"] as const)("rejects private membership without private credential provenance (%s)",async method=>{
    const first={...newGrant,privateCredential:true};
    state.rows=[[first]];
    expect((await readSessionGrants(first.accountId,first.email,undefined,method)).grants).toEqual([]);
  });
  it("never offers a private credential Account to shared fixture switching",async()=>{
    state.rows=[[adminGrant],[valorBinding],[{...studentGrant,privateCredential:true}]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants).toEqual([adminGrant]);
  });
  it("allows an existing canonical demo membership for independent owner delegation without shared-code registration", async () => {
    const target = { ...newGrant, email:"admin@unregistered.demo", emailVerifiedAt:null };
    state.rows = [[], [target]];
    expect(await readOwnerDelegationGrants(target.accountId,target.personId,target.email)).toEqual([target]);
  });
  it("rejects delegation to an ambiguous Account Person", async () => {
    state.rows = [[{id:"conflicting-active-grant"}]];
    expect(await readOwnerDelegationGrants(newGrant.accountId,newGrant.personId,newGrant.email)).toEqual([]);
  });
  it("rejects delegation to unverified real addresses and malformed scope", async () => {
    const target = {...newGrant,email:"admin@example.org",emailVerifiedAt:null};
    state.rows = [[], [target]];
    expect(await readOwnerDelegationGrants(target.accountId,target.personId,target.email)).toEqual([]);
    state.rows = [[], [{...newGrant,organizationId:null}]];
    expect(await readOwnerDelegationGrants(newGrant.accountId,newGrant.personId,newGrant.email)).toEqual([]);
  });
  it("does not expose a real verified account through public demo-admin switching", async () => {
    const real = { ...studentGrant, id:"real-grant", accountId:"real-account",
      personId:"real-person", accountPersonId:"real-person", email:"person@example.org", emailVerifiedAt:new Date() };
    state.rows = [[adminGrant],[valorBinding], [real, studentGrant]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants).toEqual([adminGrant]);
  });
  it("allows a correctly scoped synthetic Valor demo Person without an email mailbox", async () => {
    const newStudent = {
      ...studentGrant, id:"new-verified-grant", accountId:"new-can-account",
      personId:"new-canonical-person",accountPersonId:"new-canonical-person",email:"verified-new@valorschool.demo",
      emailVerifiedAt:null,
    };
    state.rows=[[newStudent],[valorBinding]];
    expect(await readSessionGrants(newStudent.accountId,newStudent.email)).toEqual({
      grants:[newStudent],demoAccountSwitching:false,
    });
  });
  it("resolves an automatically approved account-only demo participant without institutional grants",async()=>{
    const personal={id:"personal-grant",accountId:"personal-account",personId:"personal-person",
      accountPersonId:"personal-person",email:"adult@newschool.demo",role:"account_holder",
      organizationId:null,siteId:null,active:true};
    state.rows=[[personal],[school],[{id:"consumed-signup"}]];
    expect(await readSessionGrants(personal.accountId,personal.email)).toEqual({grants:[personal],demoAccountSwitching:false});
  });
  it("rejects account-only demo sign-in without approval evidence",async()=>{
    const personal={id:"personal-grant",accountId:"personal-account",personId:"personal-person",
      accountPersonId:"personal-person",email:"adult@newschool.demo",role:"account_holder",
      organizationId:null,siteId:null,active:true};
    state.rows=[[personal],[school],[]];
    expect((await readSessionGrants(personal.accountId,personal.email)).grants).toEqual([]);
  });
  it("rejects wrong-Site, wrong-organization and changed-email demo memberships", async () => {
    const base={
      ...studentGrant,id:"new-verified-grant",accountId:"new-can-account",
      personId:"new-canonical-person",email:"verified-new@valorschool.demo",
      emailVerifiedAt:new Date("2026-11-20T12:00:00Z"),
    };
    for(const invalid of [
      {siteId:"another-site"},
      {organizationId:"other-organization"},{email:"other@example.test"},
    ]){
      const candidate={...base,...invalid};
      state.rows=[[candidate],[valorBinding]];
      expect((await readSessionGrants(base.accountId,base.email)).grants).toEqual([]);
    }
  });
  it.each([
    {enabled:false},{ownerDomain:"real-school.org"},{siteOrganizationId:"other-org"},
  ])("rejects shared-code sessions when registry or owner classification changes %j",async change=>{
    state.rows=[[adminGrant],[{...valorBinding,...change}]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants).toEqual([]);
    expect(state.select).toHaveBeenCalledTimes(2); // never fall back to fixed Valor identity
  });
  it("supports the seeded Valor compatibility binding only when no registry exists",async()=>{
    state.rows=[[adminGrant],[],[{organizationId:valorBinding.organizationId,siteId:valorBinding.siteId}]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants).toEqual([adminGrant]);
  });
  it("does not grant code access to arbitrary demo-domain identities", async () => {
    state.rows = [[{ ...studentGrant, accountId: "new-account" }]];
    expect(await readSessionGrants("new-account", "new.family@valorschool.demo"))
      .toEqual({ grants: [], demoAccountSwitching: false });
  });
  it("does not broaden a public demo account after its email is changed to an ordinary address", async () => {
    state.rows = [[{ ...studentGrant, organizationId: "authentic-organization", siteId: "authentic-site" }]];
    expect(await readSessionGrants(student.accountId, "ordinary@example.test"))
      .toEqual({ grants: [], demoAccountSwitching: false });
  });
  it("preserves ordinary family memberships and never enables demo switching for them", async () => {
    const guardian = {
      ...studentGrant, id: "family-grant", accountId: "family-account",
      personId: "family-person", email: "family@example.test", role: "guardian",
      organizationId: "ordinary-school", siteId: "ordinary-site",
    };
    state.rows = [[guardian]];
    expect(await readSessionGrants(guardian.accountId, guardian.email))
      .toEqual({ grants: [guardian], demoAccountSwitching: false });
  });
  it("denies a previously issued session after its person binding changes", async () => {
    state.rows = [[{
      id: "session", accountId: student.accountId, email: student.email,
      activeGrantId: studentGrant.id,
    }], [{ ...studentGrant, personId: "authentic-person" }]];
    await expect(getCommandContext(new Request("http://localhost", {
      headers: { cookie: `__Host-can_os_session=${"a".repeat(43)}` },
    }))).rejects.toThrow("active membership");
  });
});
