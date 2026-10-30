import {describe,it,expect} from "vitest";
import {missingWorkQueue} from "../src/domain/missing-work";
describe("missing-work triage",()=>{it("flags overdue unsubmitted only, never a submitted attempt",()=>{
 const now=new Date("2026-10-15T12:00:00Z");
 const make=(assessmentId:string,status:string|null,dueAt:string)=>({assessmentId,status,dueAt,title:"Essay",course:"History",submittedAt:null});
 expect(missingWorkQueue([make("a",null,"2026-10-01T00:00:00Z"),make("b","submitted","2026-10-01T00:00:00Z"),make("c","assigned","2026-11-01T00:00:00Z")],now).map(x=>x.assessmentId)).toEqual(["a"]);
});});
