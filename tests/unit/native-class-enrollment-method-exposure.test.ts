import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("native Class enrollment method exposure",()=>{
  const publisher=read("src/components/learning/NativeClassManager.tsx");
  const roster=read("src/routes/class_.$classId.tsx");
  const invitation=read("src/modules/classes/native-class-invitations.server.ts");
  const enrollment=read("src/modules/classes/native-class-enrollment.functions.ts");
  const policy=read("src/domain/native-class-lifecycle.ts");

  it("lets publishers choose only operational methods",()=>{
    expect(publisher).toContain('{value:"self",label:"Self-enrollment"}');
    expect(publisher).toContain('{value:"assignment",label:"Assignment"}');
    expect(publisher).toContain('{value:"invitation",label:"Invitation (verified adults)"}');
    expect(publisher).toContain('{value:"approval",label:"Approval required (verified adults)"}');
    expect(policy).toContain('method !== "invitation"');
  });

  it("exposes Class invitations only with published invitation terms",()=>{
    expect(roster).toContain('workspace.offering?.state==="published"');
    expect(roster).toContain('workspace.offering.enrollmentMethods.includes("invitation")');
    expect(roster).toContain("issueNativeClassInvitation({data:");
    expect(roster).toContain("learnerPersonId,creditMode:learnerCreditMode,requestId:");
    expect(roster).toContain("No seat is reserved.");
    expect(invitation).toContain("seatReserved:false");
  });

  it("does not turn an invitation into a seat or bypass consent",()=>{
    expect(enrollment).toContain('enrollmentMethod:invitation?"invitation":approval?"approval":"self"');
    expect(enrollment).toContain('invitation.learnerPersonId!==learnerPersonId');
    expect(enrollment).toContain('invitation.expiresAt<=now');
    expect(enrollment).toContain("assertNativeClassSeatAvailable");
    expect(enrollment).toContain('state:"accepted",respondedAt:now,acceptedEnrollmentId:enrollment.id');
  });
});
