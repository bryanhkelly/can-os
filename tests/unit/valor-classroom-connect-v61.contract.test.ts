import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {
  isApprovedDemoGrant, LOCAL_DEMO_RILEY_FACILITATOR,
} from "@/domain/local-demo-access";

const source=(path:string)=>readFileSync(path,"utf8");

/** Source and pure-policy regression contracts. These do NOT substitute for
 * authenticated browser tests or Neon restricted-role integration tests. */
describe("Valor Biology hybrid Classroom Connect P0 contracts",()=>{
  it("keeps Riley's teacher and facilitator grants distinct on one account and Person",()=>{
    const f=LOCAL_DEMO_RILEY_FACILITATOR;
    const base={accountId:f.accountId,personId:f.personId,
      organizationId:f.organizationId,siteId:f.siteId};
    expect(isApprovedDemoGrant({...base,
      id:"fb000000-0000-4000-8000-000000000002",
      role:"teacher"},f.email)).toBe(true);
    expect(isApprovedDemoGrant({...base,id:f.grantId,
      role:"room_facilitator"},f.email)).toBe(true);
    expect(isApprovedDemoGrant({...base,id:f.grantId,
      role:"teacher"},f.email)).toBe(false);
    expect(isApprovedDemoGrant({...base,id:"wrong",
      role:"room_facilitator"},f.email)).toBe(false);
    expect(isApprovedDemoGrant({...base,id:f.grantId,
      role:"room_facilitator",personId:"other"},f.email)).toBe(false);
    expect(isApprovedDemoGrant({...base,id:f.grantId,
      role:"room_facilitator",siteId:"other"},f.email)).toBe(false);
  });
  it("requires facilitator appointment, not merely a teaching appointment",()=>{
    const host=source("src/modules/classes/native-class-session-host.server.ts");
    const boundary=source("src/modules/classes/native-class-room-boundary.server.ts");
    const workspace=source("src/modules/classes/native-class-workspace.functions.ts");
    expect(host).toContain('eq(canonicalClassStaffAssignments.roleCode,"facilitator")');
    expect(boundary).toContain('eq(canonicalClassStaffAssignments.roleCode,"facilitator")');
    expect(boundary).toContain('eq(accountPersonGrants.role,"room_facilitator")');
    expect(boundary).toContain('eq(accessAccounts.disabled,false)');
    expect(boundary).toContain('isNotNull(accessAccounts.emailVerifiedAt)');
    expect(workspace).toContain('canControlRoom=facilitator');
    expect(workspace).toContain('canVerifyAttendance=facilitator');
  });
  it("revalidates the active CAN session and grant within scheduling mutations",()=>{
    const session=source("src/modules/classes/native-class-facilitator-session.server.ts");
    expect(session).toContain("readCookie(request,accessSessionCookie)");
    expect(session).toContain("hashAccessSecret(raw,pepper)");
    expect(session).toContain("v301_can_staff_session_context");
    expect(session).toContain("selected.grantId!==row.grant_id");
    expect(session).toContain("selected.sessionId!==row.session_id");
    expect(session).not.toContain("v301_canonical_session_context");
    const sql=source("database/production/2026-11-20-valor-riley-classroom-connect-authority.sql");
    expect(sql).toContain("lower(a.email_normalized) NOT LIKE '%.demo'");
    expect(sql).toContain(fixGrant());
    expect(sql).toContain("s.revoked_at IS NULL");
    expect(sql).toContain("g.active = true");
    expect(sql).toContain("other_grant.person_id <> g.person_id");
  });
  it("does not let Class sessions fall back to the unused native account grant",()=>{
    const operations=source("src/modules/learning/facilitated-learning-operations.server.ts");
    expect(operations).toContain("const nativeClass = await assertNativeClassRoomStaff(tx,room)");
    expect(operations).toContain("if(nativeClass)return true");
    const boundary=source("src/modules/classes/native-class-room-boundary.server.ts");
    expect(boundary).not.toContain("canonicalAccountGrants");
  });
  it("maintains an exact one-Class idempotent fixture, with no extra Sections or Cohorts",()=>{
    const fixture=source("scripts/recovery/valor-v61-biology-hybrid-delivery-20261120.sql");
    expect(fixture).toContain("26c4fa42-7f05-a9f0-eb63-6624dc7463d3");
    expect(fixture).toContain("SET delivery_mode='hybrid'");
    expect(fixture).toContain("WHERE id=target AND delivery_mode='self_paced'");
    expect(fixture).not.toMatch(/INSERT INTO public\.(sections|cohorts|class_enrollments)/i);
    expect(fixture).toContain("other Valor Class modes");
  });
});
function fixGrant(){return LOCAL_DEMO_RILEY_FACILITATOR.grantId;}
