import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,symlink,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {staticManifest} from "./static-manifest.mjs";
async function withCatalog(run){
 const dir=await mkdtemp(join(tmpdir(),"storybook-manifest-"));
 try{
  await writeFile(join(dir,"index.html"),"manager");
  await writeFile(join(dir,"iframe.html"),"canvas");
  await writeFile(join(dir,"index.json"),'{"entries":{}}');
  await mkdir(join(dir,"assets"));
  await writeFile(join(dir,"assets/story.js"),"export const fixture=1;");
  await run(dir);
 }finally{await rm(dir,{recursive:true,force:true});}
}
test("static digest is deterministic and binds every file byte",async()=>withCatalog(async dir=>{
 const first=staticManifest(dir),second=staticManifest(dir);
 assert.equal(first.digest,second.digest);
 assert.deepEqual(first.files.map(f=>f.path),["assets/story.js","iframe.html","index.html","index.json"]);
 await writeFile(join(dir,"assets/story.js"),"export const fixture=2;");
 assert.notEqual(staticManifest(dir).digest,first.digest);
}));
test("unexpected files and missing catalog entries fail closed",async()=>withCatalog(async dir=>{
 await writeFile(join(dir,"assets/.env"),"fixture");
 assert.throws(()=>staticManifest(dir),/Unexpected static output/);
 await rm(join(dir,"assets/.env"));await rm(join(dir,"iframe.html"));
 assert.throws(()=>staticManifest(dir),/Missing static catalog entry/);
}));
test("static links and Windows junctions are not followed",async()=>withCatalog(async dir=>{
 if(process.platform==="win32")await symlink(join(dir,"assets"),join(dir,"alias"),"junction");
 else await symlink(join(dir,"index.html"),join(dir,"assets/alias.html"));
 assert.throws(()=>staticManifest(dir),/Symlink in static output/);
}));
