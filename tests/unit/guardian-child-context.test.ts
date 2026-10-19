import {describe,expect,it} from "vitest";
import {resolveGuardianChild} from "@/domain/guardian-child-context";
describe("guardian child deep-link context",()=>{
 const children=[{studentPersonId:"allowed-a"},{studentPersonId:"allowed-b"}];
 it("selects an allowed child",()=>expect(resolveGuardianChild(children,"allowed-b")).toBe("allowed-b"));
 it("does not substitute another child for an unavailable URL child ID",()=>expect(resolveGuardianChild(children,"other-family")).toBe(""));
 it("does not invent access for empty relationships",()=>expect(resolveGuardianChild([],"any")).toBe(""));
});
