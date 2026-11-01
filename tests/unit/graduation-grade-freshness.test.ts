import {describe,expect,it} from "vitest";
import {issuedGradeIds,issuedWithdrawalIds,assertIssuedGradesStillCanonical,assertIssuedWithdrawalsStillCanonical,type IssuedGradeSnapshot,type CanonicalGrade,type CanonicalWithdrawal} from "@/domain/graduation-grade-freshness";

const id="a1111111-1111-4111-8111-111111111111";
const issuer="b2222222-2222-4222-8222-222222222222";
const transcript:IssuedGradeSnapshot={sectionGradeId:id,sectionId:"math-section",letterGrade:"A",terminalPeriod:true,creditsAttempted:3,creditsEarned:3};
const grade:CanonicalGrade={id,sectionId:"math-section",letterGrade:"A",status:"finalized",updatedAt:new Date("2026-10-01T00:00:00Z"),creditIssuerId:issuer,configuredCredits:3};
const issuedAt=new Date("2026-10-15T00:00:00Z");
const check=(snap:IssuedGradeSnapshot[],grades:CanonicalGrade[])=>assertIssuedGradesStillCanonical(snap,grades,issuedAt,issuer);

describe("post-issuance canonical academic grade freshness",()=>{
 it("accepts matching finalized issuer grade evidence",()=>{
  expect(issuedGradeIds([transcript])).toEqual([id]);
  expect(()=>check([transcript],[grade])).not.toThrow();
 });
 it("fails closed on in-place corrected grades even when original letter is restored",()=>{
  expect(()=>check([transcript],[{...grade,updatedAt:new Date("2026-10-20T00:00:00Z")}])).toThrow(/correction/);
  expect(()=>check([transcript],[{...grade,letterGrade:"B"}])).toThrow(/no longer matches/);
 });
 it("rejects missing, superseded or cross-issuer canonical evidence",()=>{
  expect(()=>check([transcript],[])).toThrow(/no longer matches/);
  expect(()=>check([transcript],[{...grade,status:"draft"}])).toThrow(/no longer matches/);
  expect(()=>check([transcript],[{...grade,creditIssuerId:"another-issuer"}])).toThrow(/no longer matches/);
  expect(()=>check([transcript],[{...grade,sectionId:"different"}])).toThrow(/no longer matches/);
 });
 it("detects changed credit configurations even when the grade is unchanged",()=>{
  expect(()=>check([transcript],[{...grade,configuredCredits:4}])).toThrow(/configuration/);
  expect(()=>check([{...transcript,creditsAttempted:undefined}],[grade])).toThrow(/configuration/);
 });
 it("rejects unsupported provenance and duplicate finalized grade IDs",()=>{
  expect(()=>issuedGradeIds([{...transcript,sectionGradeId:undefined}])).toThrow(/missing/);
  expect(()=>issuedGradeIds([transcript,transcript])).toThrow(/Duplicate/);
 });
 it("accepts only a zero-credit documented W withdrawal placeholder",()=>{
  const withdrawn:IssuedGradeSnapshot={...transcript,sectionGradeId:"withdrawal:c3333333-3333-4333-8333-333333333333",letterGrade:"W",creditsEarned:0,creditsAttempted:3};
  expect(issuedGradeIds([withdrawn])).toEqual([]);
  expect(()=>check([withdrawn],[])).not.toThrow();
  expect(()=>issuedGradeIds([{...withdrawn,creditsEarned:3}])).toThrow(/withdrawal/);
 });
});

describe("canonical enrollment source for transcript W notation",()=>{
 const enrollmentId="c3333333-3333-4333-8333-333333333333";
 const w:IssuedGradeSnapshot={
   sectionGradeId:"withdrawal:"+enrollmentId,sectionId:"math-section",
   letterGrade:"W",terminalPeriod:true,creditsAttempted:3,creditsEarned:0,
   finalizedAt:"2026-10-01T10:30:00.000Z",
 };
 const current:CanonicalWithdrawal={
   id:enrollmentId,sectionId:"math-section",status:"withdrawn",kind:"section",
   withdrawalNotation:"W",endedAt:new Date("2026-10-01T10:30:00.000Z"),
   creditIssuerId:issuer,configuredCredits:3,
 };
 const verify=(rows:IssuedGradeSnapshot[],records:CanonicalWithdrawal[])=>
   assertIssuedWithdrawalsStillCanonical(rows,records,issuer);
 it("accepts exact current institutional W evidence",()=>{
   expect(issuedWithdrawalIds([w])).toEqual([enrollmentId]);
   expect(()=>verify([w],[current])).not.toThrow();
 });
 it("blocks reinstatement, transfer, missing and cross-issuer W evidence",()=>{
   expect(()=>verify([w],[])).toThrow(/no longer matches/);
   expect(()=>verify([w],[{...current,status:"active"}])).toThrow(/no longer matches/);
   expect(()=>verify([w],[{...current,kind:"program"}])).toThrow(/no longer matches/);
   expect(()=>verify([w],[{...current,creditIssuerId:"other"}])).toThrow(/no longer matches/);
   expect(()=>verify([w],[{...current,withdrawalNotation:null}])).toThrow(/no longer matches/);
 });
 it("denies retimed withdrawal or edited credit configuration",()=>{
   expect(()=>verify([w],[{...current,endedAt:new Date("2026-10-02T10:30:00Z")}])).toThrow(/revised/);
   expect(()=>verify([w],[{...current,configuredCredits:2}])).toThrow(/configuration/);
 });
 it("does not accept malformed or duplicated W source identity",()=>{
   expect(()=>issuedWithdrawalIds([{...w,sectionGradeId:"withdrawal:not-a-uuid"}])).toThrow(/Invalid withdrawal/);
   expect(()=>issuedWithdrawalIds([w,w])).toThrow(/Duplicate withdrawal/);
 });
});
