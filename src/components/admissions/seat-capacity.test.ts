import {describe,it,expect} from "vitest";
import {parseSeatCapacity} from "./seat-capacity";
describe("seat capacity input guard",()=>{
 it("accepts positive integer seats within the UI range",()=>{
  expect(parseSeatCapacity("1")).toBe(1);
  expect(parseSeatCapacity(" 100000 ")).toBe(100000);
 });
 it.each([""," ","0","-1","1.5","1e3","NaN","Infinity","100001","9007199254740993"])("rejects malformed or out of range input %s",input=>{
  expect(parseSeatCapacity(input)).toBeNull();
 });
});
