import { describe, expect, it } from "vitest";
import { useLaunchModelPresets } from "@/hooks/useLaunchModelPresets";
import type { SchoolModelPreset } from "@/components/operations/LaunchSchoolModelPicker";

function harness(){
  const values: Record<string, string | boolean> = {};
  const set = (key:string) => (value:string | boolean) => {values[key]=value;};
  const presets=useLaunchModelPresets({
    setType:set("type") as Parameters<typeof useLaunchModelPresets>[0]["setType"],
    setGradeMin:set("min") as Parameters<typeof useLaunchModelPresets>[0]["setGradeMin"],
    setGradeMax:set("max") as Parameters<typeof useLaunchModelPresets>[0]["setGradeMax"],
    setOnsite:set("onsite") as Parameters<typeof useLaunchModelPresets>[0]["setOnsite"],
    setOnsiteDaysPerWeek:set("days") as Parameters<typeof useLaunchModelPresets>[0]["setOnsiteDaysPerWeek"],
    setAsynchronous:set("async") as Parameters<typeof useLaunchModelPresets>[0]["setAsynchronous"],
    setLiveOnline:set("live") as Parameters<typeof useLaunchModelPresets>[0]["setLiveOnline"],
    setSummerCreditBearing:set("summerCredit") as Parameters<typeof useLaunchModelPresets>[0]["setSummerCreditBearing"],
  });
  return {values,presets};
}
describe("launch configuration presets",()=>{
 it.each([
  ["elementary","church_hosted_academy","K","5","5",false],
  ["middle","church_hosted_academy","6","8","5",false],
  ["high","church_hosted_academy","9","12","5",false],
  ["k12","full_school","K","12","5",false],
  ["micro","microschool","K","8","4",true],
  ["hybrid","hybrid_program","6","12","2",true],
 ] as const)("%s applies its editable defaults", (model,type,min,max,days,asyncFlag)=>{
  const {values,presets}=harness();
  presets.applySchoolModelPreset(model as SchoolModelPreset);
  expect(values).toMatchObject({type,min,max,days,async:asyncFlag,onsite:true,live:false,summerCredit:false});
 });
 it("a ninth grade hybrid preset does not authorize credit or opening",()=>{
  const {values,presets}=harness();
  presets.applyNinthGradeHybridPreset();
  expect(values).toMatchObject({type:"high_school_extension",min:"9",max:"9",days:"2",async:true,summerCredit:false});
 });
 it("after school enrichment resets a previous credit-bearing choice",()=>{
  const {values,presets}=harness();
  presets.applyExtendedLearningPreset("after_school_enrichment");
  expect(values).toMatchObject({type:"after_school_enrichment",min:"K",max:"12",days:"3",async:false,summerCredit:false});
 });
});
