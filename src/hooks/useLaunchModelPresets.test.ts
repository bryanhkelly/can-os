import { describe, expect, it } from "vitest";
import { useLaunchModelPresets } from "@/hooks/useLaunchModelPresets";
import { programTypes } from "@/domain/program-offerings";

function harness(){
  const values: Record<string, string | boolean> = { min: "K", max: "12", summerCredit: true };
  const set = (key:string) => (value:string | boolean) => {values[key]=value;};
  const presets=useLaunchModelPresets({
    setType:set("type") as Parameters<typeof useLaunchModelPresets>[0]["setType"],
    setSummerCreditBearing:set("summerCredit") as Parameters<typeof useLaunchModelPresets>[0]["setSummerCreditBearing"],
  });
  return {values,presets};
}
describe("launch configuration presets",()=>{
 it.each(programTypes)("%s selection leaves grade range independent", type=>{
  const {values,presets}=harness();
  presets.applyProgramType(type);
  expect(values).toMatchObject({type,min:"K",max:"12",summerCredit:type==="summer_program"});
 });
 it("keeps a summer credit choice only for the summer academic Program",()=>{
  const {values,presets}=harness();
  presets.applyProgramType("summer_program");
  expect(values.type).toBe("summer_program");
  expect(values.summerCredit).toBe(true);
 });
});
