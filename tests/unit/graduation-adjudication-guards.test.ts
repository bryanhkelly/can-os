import {describe,it,expect} from "vitest";
import {adjudicateGraduation} from "@/domain/graduation-adjudication";
const base={requirementSetId:"policy-1",transcriptIssuanceId:"transcript-1",requirementIssuerId:"issuer-1",transcriptIssuerId:"issuer-1",studentProfileId:"student-1",transcriptStudentProfileId:"student-1",requirements:[{subject:"Math",minimumUnits:3}],evidence:[{sectionId:"section-1",subject:"Math",earnedUnits:3,finalized:true,acceptedByIssuer:true}],decision:"approved" as const};
describe("graduation adjudication authority and evidence",()=>{
 it("rejects a cross-issuer policy",()=>expect(()=>adjudicateGraduation({...base,transcriptIssuerId:"issuer-2"})).toThrow(/matching institutional issuer/));
 it("rejects a mismatched student",()=>expect(()=>adjudicateGraduation({...base,transcriptStudentProfileId:"student-2"})).toThrow(/matching institutional issuer/));
 it("rejects withdrawn/unaccepted credits",()=>expect(()=>adjudicateGraduation({...base,evidence:[{...base.evidence[0]!,acceptedByIssuer:false}]})).toThrow(/deficient or incomplete/));
 it("rejects missing credit from a replaced transcript snapshot",()=>expect(()=>adjudicateGraduation({...base,evidence:[]})).toThrow(/deficient or incomplete/));
 it("does not turn an audit into a credential",()=>{const result=adjudicateGraduation(base);expect(result.decision).toBe("approved");expect(result).not.toHaveProperty("diplomaId")});
});
