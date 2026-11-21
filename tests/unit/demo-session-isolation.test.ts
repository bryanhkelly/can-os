import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCAL_DEMO_ACCOUNTS, LOCAL_DEMO_ADMIN, LOCAL_DEMO_ROOM_FACILITATOR, LOCAL_DEMO_RILEY_FACILITATOR } from "@/domain/local-demo-access";
import { readSessionGrants } from "@/modules/identity/session-grants.server";
import { getCommandContext } from "@/modules/identity/command-context.server";

const state = vi.hoisted(() => ({ rows: [] as unknown[][], select: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: state.select } }));
const student = LOCAL_DEMO_ACCOUNTS[0];
const studentGrant = {
  ...student, id: "student-grant", role: "student", active: true,
  organizationId: LOCAL_DEMO_ADMIN.organizationId, siteId: LOCAL_DEMO_ADMIN.siteId,
};
const adminGrant = {
  ...LOCAL_DEMO_ADMIN, id: LOCAL_DEMO_ADMIN.grantId, role: "site_admin", active: true,
};
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
    ...LOCAL_DEMO_ROOM_FACILITATOR, id: LOCAL_DEMO_ROOM_FACILITATOR.grantId,
    role: "room_facilitator", active: true,
  };
  it("offers two separately verified grants to Riley with one immutable Person",async()=>{
    const primary={
      ...LOCAL_DEMO_RILEY_FACILITATOR,
      id:"fb000000-0000-4000-8000-000000000002",
      role:"teacher",active:true,
    };
    const facilitator={
      ...LOCAL_DEMO_RILEY_FACILITATOR,
      id:LOCAL_DEMO_RILEY_FACILITATOR.grantId,
      role:"room_facilitator",active:true,
    };
    state.rows=[[primary,facilitator]];
    expect(await readSessionGrants(primary.accountId,primary.email)).toEqual({
      grants:[primary,facilitator],demoAccountSwitching:false,
    });
  });
  it("never accepts an unauthorized replacement of Riley's second grant",async()=>{
    const grant={
      ...LOCAL_DEMO_RILEY_FACILITATOR,id:"replacement-grant",
      role:"room_facilitator",active:true,
    };
    state.rows=[[grant]];
    expect((await readSessionGrants(grant.accountId,grant.email)).grants).toEqual([]);
  });
  it("gives Sally only her own room-facilitator workspace, not demo-admin switching", async () => {
    state.rows = [[facilitatorGrant]];
    expect(await readSessionGrants(facilitatorGrant.accountId, facilitatorGrant.email)).toEqual({
      grants: [facilitatorGrant], demoAccountSwitching: false,
    });
  });
  it.each([{ role: "site_admin" }, { role: "teacher" }, { siteId: "foreign" },
    { organizationId: "foreign" }, { personId: "foreign" }, { accountId: "foreign" }])(
    "denies changed Valor facilitator identity %j", async change => {
      state.rows = [[{ ...facilitatorGrant, ...change }]];
      expect((await readSessionGrants(facilitatorGrant.accountId, facilitatorGrant.email)).grants).toEqual([]);
    },
  );
  it("includes a currently verified Riley facilitator in Admin switching", async () => {
    const riley={...LOCAL_DEMO_RILEY_FACILITATOR,
      id:LOCAL_DEMO_RILEY_FACILITATOR.grantId,
      role:"room_facilitator",active:true};
    state.rows=[[adminGrant],[riley]];
    expect((await readSessionGrants(adminGrant.accountId,adminGrant.email)).grants)
      .toEqual([adminGrant,riley]);
  });
  const school = {
    domain: "newschool.demo", organizationId: "new-organization", siteId: "new-site",
    adminAccountId: "new-account", adminPersonId: "new-person", adminGrantId: "new-grant",
    enabled: true, siteOrganizationId: "new-organization",
  };
  const newGrant = {
    id: school.adminGrantId, accountId: school.adminAccountId, personId: school.adminPersonId,
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
    { role: "registrar" }, { organizationId: "foreign-school" }, { siteId: "foreign-site" },
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
    { role: "registrar" }, { organizationId: "another-organization" },
    { siteId: "another-site" },
  ])("excludes a changed canonical student binding %j", async change => {
    state.rows = [[{ ...studentGrant, ...change }]];
    expect((await readSessionGrants(student.accountId, student.email)).grants).toEqual([]);
  });
  it("enumerates current existing Site users for Admin switch without a fixed roster", async () => {
    const newStaff = {
      ...studentGrant, id:"new-person-grant", accountId:"new-person-account",
      personId:"new-person", role:"student",email:"student@valorschool.demo",
    };
    state.rows = [[adminGrant],[studentGrant,newStaff]];
    const result=await readSessionGrants(LOCAL_DEMO_ADMIN.accountId,LOCAL_DEMO_ADMIN.email);
    expect(result).toEqual({
      grants:[adminGrant,studentGrant,newStaff],
      demoAccountSwitching:true,
      launchSiteId:LOCAL_DEMO_ADMIN.siteId,
    });
  });
  it("allows any verified, correctly scoped Valor demo Person without a fixed ID", async () => {
    const newStudent = {
      ...studentGrant, id:"new-verified-grant", accountId:"new-can-account",
      personId:"new-canonical-person", email:"verified-new@valorschool.demo",
      emailVerifiedAt:new Date("2026-11-20T12:00:00Z"),
    };
    state.rows=[[newStudent]];
    expect(await readSessionGrants(newStudent.accountId,newStudent.email)).toEqual({
      grants:[newStudent],demoAccountSwitching:false,
    });
  });
  it("rejects disabled, unverified and wrong-Site demo memberships", async () => {
    const base={
      ...studentGrant,id:"new-verified-grant",accountId:"new-can-account",
      personId:"new-canonical-person",email:"verified-new@valorschool.demo",
      emailVerifiedAt:new Date("2026-11-20T12:00:00Z"),
    };
    for(const invalid of [
      {emailVerifiedAt:null},{siteId:"another-site"},
      {organizationId:"other-organization"},{email:"other@example.test"},
    ]){
      const candidate={...base,...invalid};
      state.rows=[[candidate]];
      expect((await readSessionGrants(base.accountId,base.email)).grants).toEqual([]);
    }
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
