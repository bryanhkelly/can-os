import {describe,expect,it} from "vitest";
import {transitionAdmissionsOffer} from "../src/domain/admissions-offer-lifecycle";
describe("offer responses stay guarded",()=>{
 const source={status:"issued" as const,applicationId:"application",schoolYearId:"2027",expiresAt:"2026-12-01T00:00:00.000Z"};
 it("cannot accept an offer after expiration",()=>{expect(()=>transitionAdmissionsOffer(source,"accept",new Date("2026-12-02T00:00:00.000Z"))).toThrow("expired");});
 it("cannot accept an already declined offer",()=>{expect(()=>transitionAdmissionsOffer({...source,status:"declined"},"accept",new Date("2026-11-01T00:00:00.000Z"))).toThrow();});
});
