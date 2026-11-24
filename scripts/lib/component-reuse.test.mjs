import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { indexSource, newDuplicateGroups, crossFileDuplicates, isProductionSource } from "./component-reuse-fingerprints.mjs";
import { indexCommittedSources, resolveReuseBase } from "./component-reuse-baseline.mjs";

const body = '{ const items = input.filter(value => value.enabled && value.visible); const result = items.map(value => ({id:value.id,label:value.label,description:value.description,priority:value.priority})); return result.sort((first,second)=>first.priority-second.priority); }';
const source = (name, value=body) => "function "+name+"(input) "+value;
const index = (...paths) => {
  const result=new Map();
  for(const path of paths)indexSource(path,source("example"),result);
  return result;
};
test("detects copied function bodies with different names and formatting",()=>{
  const result=index("src/a.ts");
  indexSource("src/b.ts",source("renamed",body.replaceAll("; ",";\n  ").replace("const","/* comment */ const")),result);
  assert.equal(crossFileDuplicates(result).length,1);
  assert.equal(newDuplicateGroups(result,index("src/a.ts"))[0].addedCopies,1);
});
test("does not confuse whitespace inside literals with formatting",()=>{
  const result=new Map();
  indexSource("src/a.ts",source("a",body.replace("return result","const label = 'a b'; return result")),result);
  indexSource("src/b.ts",source("b",body.replace("return result","const label = 'a  b'; return result")),result);
  assert.equal(crossFileDuplicates(result).length,0);
});
test("ratchets existing duplication without penalizing moves or removals",()=>{
  const base=index("src/a.ts","src/b.ts");
  assert.equal(newDuplicateGroups(index("src/a.ts","src/c.ts"),base).length,0);
  assert.equal(newDuplicateGroups(index("src/a.ts"),base).length,0);
  assert.equal(newDuplicateGroups(index("src/a.ts","src/b.ts","src/c.ts"),base)[0].addedCopies,1);
});
test("counts brand new duplicated groups and excludes short and test sources",()=>{
  assert.equal(newDuplicateGroups(index("src/a.ts","src/b.ts"),new Map())[0].previousCount,0);
  assert.equal(indexSource("src/a.ts","function a(){return 1;}").size,0);
  assert.equal(isProductionSource("src/a.test.ts"),false);
  assert.equal(isProductionSource("src/a.d.ts"),false);
  assert.equal(isProductionSource("src/a.tsx"),true);
});
test("reads exact committed baseline including unicode and ignores working tree changes",()=>{
  const root=mkdtempSync(join(tmpdir(),"reuse-test-"));
  const git=(...args)=>execFileSync("git",args,{cwd:root,stdio:["ignore","pipe","pipe"]}).toString().trim();
  try{
    git("init");git("config","user.name","Reuse Test");git("config","user.email","reuse@example.test");
    mkdirSync(join(root,"src"));
    const original=source("example",body.replace("return result","const title = 'é'; return result"));
    writeFileSync(join(root,"src","a.ts"),original);
    writeFileSync(join(root,"src","a.test.ts"),original);
    git("add",".");git("commit","-m","base");
    const base=git("rev-parse","HEAD");
    writeFileSync(join(root,"src","a.ts"),"export const changed = true;");
    const saved=indexCommittedSources(root,resolveReuseBase(root,base));
    assert.deepEqual(saved,indexSource("src/a.ts",original));
  }finally{rmSync(root,{recursive:true,force:true});}
});
