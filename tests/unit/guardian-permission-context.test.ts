import { describe, expect, it } from "vitest";
import { coursePermissionContext, groupPermissionContext } from "@/domain/guardian-permission-context";

describe("guardian permission acknowledgements", () => {
  it("does not carry a class acknowledgement into changed request details", () => {
    const original={id:"request-1",studentName:"Student A",sectionCode:"MATH-1",
      sectionTitle:"Mathematics",deadline:"2027-01-01",status:"open",contentReady:true};
    const acknowledged=coursePermissionContext(original);
    expect(coursePermissionContext({...original})).toBe(acknowledged);
    expect(coursePermissionContext({...original,sectionTitle:"Advanced Mathematics"})).not.toBe(acknowledged);
    expect(coursePermissionContext({...original,deadline:"2027-01-10"})).not.toBe(acknowledged);
    expect(coursePermissionContext({...original,studentName:"Student B"})).not.toBe(acknowledged);
    expect(coursePermissionContext({...original,status:"closed"})).not.toBe(acknowledged);
  });
  it("does not carry group consent into a changed or closed membership request", () => {
    const original={id:"group-action-1",groupTitle:"Chess Club",studentName:"Student A",
      status:"open",obsolete:false,decision:null};
    const acknowledged=groupPermissionContext(original);
    expect(groupPermissionContext({...original})).toBe(acknowledged);
    expect(groupPermissionContext({...original,studentName:"Student B"})).not.toBe(acknowledged);
    expect(groupPermissionContext({...original,groupTitle:"Study Group"})).not.toBe(acknowledged);
    expect(groupPermissionContext({...original,status:"resolved"})).not.toBe(acknowledged);
    expect(groupPermissionContext({...original,obsolete:true})).not.toBe(acknowledged);
  });
});
