import {describe,expect,it} from "vitest";
import {assertApplicationAcceptance,assertApplicationRetryOwnership} from "../src/domain/admissions-transitions";
describe("admissions transition guards",()=>{
 it("rejects acceptance of withdrawn or declined applications",()=>{expect(()=>assertApplicationAcceptance("withdrawn")).toThrow();expect(()=>assertApplicationAcceptance("declined")).toThrow();expect(()=>assertApplicationAcceptance("application")).not.toThrow();});
 it("prevents cross-guardian idempotency replay",()=>{expect(()=>assertApplicationRetryOwnership({submittedByPersonId:"a",programId:"p"},"b","p")).toThrow();expect(()=>assertApplicationRetryOwnership({submittedByPersonId:"a",programId:"p"},"a","q")).toThrow();});
});
