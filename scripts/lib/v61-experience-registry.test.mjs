import {test} from "node:test";
import assert from "node:assert/strict";
import {validateExperienceRegistry} from "./v61-experience-registry.mjs";
const path="src/routes/example.tsx", story="src/components/example.stories.tsx#Example";
const row={path,layout:"dashboard",persona:"Site operator",review:"unreviewed",patterns:["DashboardLayout"],stories:[story],evidence:{responsive:null,accessibility:null,visual:null,browserJourney:null}};
const fixture={version:1,designSystem:"V6.1",layouts:{dashboard:"Dashboard"},layoutReferences:{dashboard:story},routes:[row]};
const read=()=>"export const Example = {};";
test("provisional coverage remains outstanding without failing the inventory gate",()=>{
 const result=validateExperienceRegistry(fixture,[path],read);
 assert.equal(result.errors.length,0);assert.equal(result.outstanding.length,1);
 assert.deepEqual(result.layoutSummary.dashboard,{total:1,verified:0,outstanding:1});
});
test("verified declarations require actual nonempty evidence references",()=>{
 const result=validateExperienceRegistry({...fixture,routes:[{...row,review:"verified",evidence:{responsive:true}}]},[path],read);
 assert.ok(result.errors.some(error=>error.includes("Verified route lacks")));
});
test("complete declarations do not assert runtime verification",()=>{
 const result=validateExperienceRegistry({...fixture,routes:[{...row,review:"verified",evidence:{responsive:"review:1",accessibility:"review:2",visual:"review:3",browserJourney:"review:4"}}]},[path],read);
 assert.equal(result.errors.length,0);assert.equal(result.outstanding.length,0);
 assert.match(result.note,/not runtime/);
});
test("route drift and missing story exports fail validation",()=>{
 const result=validateExperienceRegistry(fixture,[path,"src/routes/new.tsx"],()=>"export const Other = {};");
 assert.ok(result.errors.some(error=>error.includes("Unregistered route")));
 assert.ok(result.errors.some(error=>error.includes("Missing story export")));
});
test("verified non-page boundary needs explicit reason",()=>{
 const result=validateExperienceRegistry({...fixture,routes:[{...row,layout:null,review:"boundary"}]},[path],read);
 assert.ok(result.errors.some(error=>error.includes("Boundary requires reason")));
});
test("story references cannot escape source directory",()=>{
 const result=validateExperienceRegistry({...fixture,layoutReferences:{dashboard:"src/../example.stories.tsx#Example"}},[path],read);
 assert.ok(result.errors.some(error=>error.includes("Invalid story")));
});
