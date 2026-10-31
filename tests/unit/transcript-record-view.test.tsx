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
  it("shows issuer-separated subject credit inventory and missing credit review without awarding a diploma",()=>{
    const html=renderToStaticMarkup(<TranscriptView rows={[
      row({ sectionId:"algebra",termId:"fall",creditIssuingOrganizationId:"can",
        subject:"Mathematics",terminalPeriod:true }),
      row({sectionGradeId:"biology",sectionId:"biology",termId:"fall",
        creditIssuingOrganizationId:"can",subject:"Science",
        terminalPeriod:true,sectionTitle:"Biology I",
        creditsAttempted:null,creditsEarned:null,creditConfigured:false}),
      row({sectionGradeId:"other",sectionId:"other",termId:"fall",
        creditIssuingOrganizationId:"other",creditIssuingOrganization:"Outside School",
        subject:"Mathematics",terminalPeriod:true,
        creditsAttempted:0.5,creditsEarned:0.5}),
    ]} issuances={[]}/>);
    expect(html).toContain("Recorded credits by subject");
    expect(html).toContain("Mathematics");
    expect(html).toContain("Science");
    expect(html).toContain("Outside School");
    expect(html).toContain("credit entries require review");
    expect(html).toContain("not an official graduation audit");
    expect(html).toContain("does not establish diploma eligibility");
    expect(html).toContain("Credits: Not recorded");
  });
  it("does not invent credits when historical rows lack source/term provenance",()=>{
    const html=renderToStaticMarkup(<TranscriptView rows={[row()]} issuances={[]}/>);
    expect(html).toContain("lacks the provenance");
    expect(html).toContain("Algebra I");
    expect(html).not.toContain("1 earned / 1 attempted");
  });
  it("shows explicitly recorded earned credits without inventing others",()=>{
    const html=renderToStaticMarkup(<TranscriptView rows={[row()]} issuances={[]}/>);
    expect(html).toContain("1/1 credits earned");
    expect(html).not.toContain("Credits: Not recorded");
  });
});
