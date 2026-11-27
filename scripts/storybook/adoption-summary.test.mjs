import {test} from "node:test";
import assert from "node:assert/strict";
import {adoptionSummary} from "../../src/domain/v61-adoption-summary.ts";
const base={path:"src/routes/example.tsx",layout:"dashboard",persona:"operator",review:"unreviewed",patterns:["DashboardLayout"],stories:["src/components/example.stories.tsx#Example"],evidence:{responsive:null,accessibility:null,visual:null,browserJourney:null}};
const registry=routes=>({layouts:{dashboard:"Dashboard",directory:"Directory"},layoutReferences:{dashboard:"reference"},routes});
test("story linkage is not review completeness",()=>{
 const s=adoptionSummary(registry([base]));
 assert.equal(s.total,1);assert.equal(s.linked,1);assert.equal(s.complete,0);assert.equal(s.pending,1);assert.equal(s.layoutReferences,1);
});
test("complete review declarations require every evidence dimension",()=>{
 const ready={...base,review:"verified",evidence:{responsive:"r",accessibility:"a",visual:"v",browserJourney:"b"}};
 const s=adoptionSummary(registry([ready,{...ready,path:"other",evidence:{...ready.evidence,visual:" "}}]));
 assert.equal(s.complete,1);assert.equal(s.pending,1);assert.deepEqual(s.rows[1].missing,["visual"]);
});
test("reviewed boundaries are separate from outstanding and complete pages",()=>{
 const s=adoptionSummary(registry([{...base,layout:null,review:"boundary",boundaryReason:"redirect"},{...base,layout:"unknown",review:"boundary"}]));
 assert.equal(s.boundary,1);assert.equal(s.pending,1);assert.equal(s.complete,0);
 assert.equal(s.groups.reduce((n,row)=>n+row.total,0),s.total);
 assert.equal(s.groups.find(row=>row.key==="unclassified").total,1);
});
