import {describe,expect,it} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {TranscriptView, type ReportCardGrade} from "@/components/report-card";

const row = (overrides:Partial<ReportCardGrade>={}):ReportCardGrade => ({
  sectionGradeId:"grade-1",
  sectionTitle:"Algebra I",
  letterGrade:"B",
  creditsAttempted:1,
  creditsEarned:1,
  creditConfigured:true,
  percentage:"85",
  score:"85",
  gradingPeriodName:"Semester 1",
  termName:"Fall",
  schoolYearName:"2026–2027",
  programName:"High School",
  creditIssuingOrganization:"Authorized School",
  ...overrides,
});

describe("transcript rendering",()=>{
  it("keeps a graded class on the official record when credit units are missing",()=>{
    const html=renderToStaticMarkup(<TranscriptView rows={[
      row(),
      row({sectionGradeId:"grade-2",sectionTitle:"Biology I",creditsAttempted:null,
        creditsEarned:null,creditConfigured:false}),
    ]} issuances={[]}/>);
    expect(html).toContain("Algebra I");
    expect(html).toContain("Biology I");
    expect(html).toContain("Credits: Not recorded");
    expect(html).toContain("Academic record issuer: Authorized School");
    expect(html).not.toContain("official issuance blocked");
    expect(html).toContain("does not certify graduation");
  });
  it("shows explicitly recorded earned credits without inventing others",()=>{
    const html=renderToStaticMarkup(<TranscriptView rows={[row()]} issuances={[]}/>);
    expect(html).toContain("1/1 credits earned");
    expect(html).not.toContain("Credits: Not recorded");
  });
});
