import {test} from "node:test";
import assert from "node:assert/strict";
import {checkStorybookIndex,findStoryEntry,storyExportSlug} from "./index-contract.mjs";
const titles=["00 Start here/Welcome","05 Page layouts/Choosing a layout","04 Application patterns/Interaction contract","12 Engineering and acceptance/Authoring standards","12 Engineering and acceptance/Release gates"];
const guideEntries=Object.fromEntries(titles.map((title,i)=>["guide"+i,{type:"docs",title}]));
const entry={type:"story",id:"sample--ready-for-review",importPath:"./src/example.stories.tsx",title:"Example",exportName:"ReadyForReview"};
const registry={layoutReferences:{example:"src/example.stories.tsx#ReadyForReview"},routes:[]};
test("real index checks references and required docs",()=>{
 const result=checkStorybookIndex({entries:{...guideEntries,sample:entry}},registry);
 assert.deepEqual(result.errors,[]);assert.equal(result.stories,1);assert.equal(result.docs,5);
});
test("missing story or guide fails",()=>{
 const result=checkStorybookIndex({entries:{sample:{...entry,exportName:"Other"}}},registry);
 assert.equal(result.errors.length,6);
});
test("stable explicit IDs use the export when available",()=>{
 const result=checkStorybookIndex({entries:{...guideEntries,sample:{...entry,id:"legacy--existing"}}},registry);
 assert.deepEqual(result.errors,[]);
});
test("legacy index without exportName uses normalized ID",()=>{
 const result=checkStorybookIndex({entries:{...guideEntries,sample:{...entry,exportName:undefined}}},registry);
 assert.deepEqual(result.errors,[]);
});

test("Windows path prefixes and separators resolve the same registered story",()=>{
 const windows={...entry,importPath:".\\src\\example.stories.tsx"};
 assert.equal(findStoryEntry([windows],{path:"src/example.stories.tsx",exportName:"ReadyForReview"}),windows);
 assert.deepEqual(checkStorybookIndex({entries:{...guideEntries,sample:windows}},registry).errors,[]);
});
test("older index IDs resolve acronyms without display-name guessing",()=>{
 const legacy={...entry,exportName:undefined,id:"sample--review-api-response",name:"Review API Response"};
 assert.equal(storyExportSlug("ReviewAPIResponse"),"review-api-response");
 assert.equal(findStoryEntry([legacy],{title:"Example",exportName:"ReviewAPIResponse"}),legacy);
 assert.equal(findStoryEntry([{...legacy,exportName:"Other"}],{title:"Example",exportName:"ReviewAPIResponse"}),undefined);
});
test("missing, malformed and ambiguous identities fail closed",()=>{
 assert.equal(findStoryEntry([entry],{exportName:"ReadyForReview"}),undefined);
 assert.equal(findStoryEntry([entry],{path:"src/example.stories.tsx",exportName:undefined}),undefined);
 assert.equal(findStoryEntry([entry,{...entry,id:"duplicate--ready-for-review"}],{path:"src/example.stories.tsx",exportName:"ReadyForReview"}),undefined);
 assert.equal(checkStorybookIndex({entries:{...guideEntries,sample:entry}},{layoutReferences:{bad:"src/example.stories.tsx"}}).errors.length,1);
});
