import {describe,it,expect} from "vitest";
import {blueprintReviewReceipt,matchesBlueprintReviewReceipt,decideBlueprintReviewInputSchema} from "@/domain/blueprint-review";
const id=(n:number)=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const input=decideBlueprintReviewInputSchema.parse({reviewId:id(1),configurationVersionId:id(2),decision:"approved",
 evidenceVersionId:id(3),rationale:"Independent review completed",components:[
 {componentId:id(4),decision:"approved",evidenceVersionId:id(5),conditions:null},
 {componentId:id(6),decision:"approved",evidenceVersionId:id(7),conditions:"Reviewed terms"}
 ]});
describe("Blueprint review retry receipts",()=>{
 it("accepts exact retries independently of component ordering",()=>{
  expect(matchesBlueprintReviewReceipt(blueprintReviewReceipt(input),{...input,components:[...input.components].reverse()})).toBe(true);
 });
 it("rejects changed rationale, evidence, conditions or missing component decisions",()=>{
  const receipt=blueprintReviewReceipt(input);
  expect(matchesBlueprintReviewReceipt(receipt,{...input,rationale:"Different rationale"})).toBe(false);
  expect(matchesBlueprintReviewReceipt(receipt,{...input,components:input.components.slice(1)})).toBe(false);
  expect(matchesBlueprintReviewReceipt(receipt,{...input,components:input.components.map(c=>({...c,evidenceVersionId:id(9)}))})).toBe(false);
  expect(matchesBlueprintReviewReceipt(receipt,{...input,components:input.components.map(c=>({...c,conditions:"Changed"}))})).toBe(false);
  expect(matchesBlueprintReviewReceipt({rationale:input.rationale},input)).toBe(false);
 });
});
