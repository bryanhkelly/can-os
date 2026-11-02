import { describe, expect, it } from "vitest";
import { auditGraduationCredits } from "@/domain/graduation-credit-audit";

const requirements = [
  { subject: "Mathematics", minimumUnits: 3 },
  { subject: "English", minimumUnits: 4 },
];
const math = { sectionId: "math-1", subject: "Mathematics", earnedUnits: 3, finalized: true, acceptedByIssuer: true };
const english = { sectionId: "english-1", subject: "English", earnedUnits: 4, finalized: true, acceptedByIssuer: true };

describe("graduation credit audit policy", () => {
  it("requires institution-defined requirements", () => {
    expect(auditGraduationCredits([], [math]).status).toBe("incomplete");
  });
  it("reports subject-specific deficiencies without conferring graduation", () => {
    const result = auditGraduationCredits(requirements, [math]);
    expect(result.status).toBe("deficient");
    expect(result.deficiencies).toEqual([{subject:"English",required:4,earned:0,missing:4}]);
  });
  it("reports requirements met only with verified evidence", () => {
    const result = auditGraduationCredits(requirements, [math, english]);
    expect(result.status).toBe("requirements_met");
    expect(result.totalEarned).toBe(7);
  });
  it("fails closed on unaccepted transfer credit", () => {
    const result = auditGraduationCredits(requirements, [math, {...english, acceptedByIssuer:false}]);
    expect(result.status).toBe("incomplete");
  });
  it("fails closed on missing credit values", () => {
    expect(auditGraduationCredits(requirements, [math, {...english,earnedUnits:null}]).status).toBe("incomplete");
  });
  it("fails closed on duplicate sections and duplicate requirements", () => {
    expect(auditGraduationCredits(requirements, [math,math,english]).status).toBe("incomplete");
    expect(auditGraduationCredits([...requirements,requirements[0]], [math,english]).status).toBe("incomplete");
  });
  it("matches differently capitalized subject evidence without double counting requirements",()=>{
    expect(auditGraduationCredits(requirements,[{...math,subject:"mathematics"},{...english,subject:"ENGLISH"}]).status).toBe("requirements_met");
    expect(auditGraduationCredits([...requirements,{subject:"mathEMATICS",minimumUnits:3}],[math,english]).status).toBe("incomplete");
  });
  it("rejects negative, fractional-beyond-hundredth and nonfinite units", () => {
    for(const units of [-1,0.001,Number.NaN,Number.POSITIVE_INFINITY]){
      expect(auditGraduationCredits(requirements,[{...math,earnedUnits:units},english]).status).toBe("incomplete");
    }
  });
});
