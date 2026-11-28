import {describe,it,expect} from "vitest";
import {z} from "zod";
import {parseCommandInput} from "./command-input";
import {normalizeClientError} from "@/lib/client-error";
describe("explicit command input boundary",()=>{
 it("preserves defaults and transforms",()=>{
  expect(parseCommandInput(z.object({name:z.string().trim(),count:z.number().default(1)}),{name:"  QA  "})).toEqual({name:"QA",count:1});
 });
 it("marks malformed input without revealing private values",()=>{
  try{parseCommandInput(z.string().min(20),"private");throw Error("expected rejection");}
  catch(error){expect(normalizeClientError(error)).toMatchObject({code:"VALIDATION_FAILED",kind:"validation"});expect(String(error)).not.toContain("private");}
 });
 it("does not swallow unexpected refinement errors",()=>{
  expect(()=>parseCommandInput(z.string().transform(()=>{throw Error("internal fault");}),"value")).toThrow("internal fault");
 });
});
