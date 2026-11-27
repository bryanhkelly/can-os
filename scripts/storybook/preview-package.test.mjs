import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from "node:fs";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {staticManifest} from "./static-manifest.mjs";
import {previewMetadata,writePreviewMetadata,verifyPreviewPackage} from "./preview-package.mjs";
function fixture(run,cloudflare=true){
 const dir=mkdtempSync(join(tmpdir(),"storybook-package-"));
 try{
  const source=join(dir,"source"),staged=join(dir,"staged");mkdirSync(source);mkdirSync(staged);
  for(const [name,value] of Object.entries({"index.html":"manager","iframe.html":"canvas","index.json":"{}"})){
   writeFileSync(join(source,name),value);writeFileSync(join(staged,name),value);
  }
  writeFileSync(join(source,"entry.js.map"),"source map");
  const accepted=staticManifest(source);writePreviewMetadata(staged,cloudflare);
  run({accepted,staged});
 }finally{rmSync(dir,{recursive:true,force:true});}
}
test("exact package is reusable and excludes source maps",()=>fixture(({accepted,staged})=>{
 assert.equal(verifyPreviewPackage(staged,accepted,true).files.length,3);
 assert.equal(verifyPreviewPackage(staged,accepted,true).files.length,3);
 writeFileSync(join(staged,"entry.js.map"),"unexpected");
 assert.throws(()=>verifyPreviewPackage(staged,accepted,true),/differ/);
}));
test("changed asset, extra asset and changed security metadata are rejected",()=>fixture(({accepted,staged})=>{
 writeFileSync(join(staged,"index.html"),"changed");
 assert.throws(()=>verifyPreviewPackage(staged,accepted,true),/differ/);
 writeFileSync(join(staged,"index.html"),"manager");
 writeFileSync(join(staged,"extra.js"),"unexpected");
 assert.throws(()=>verifyPreviewPackage(staged,accepted,true),/differ/);
 rmSync(join(staged,"extra.js"));
 for(const [name,value] of Object.entries(previewMetadata(true))){
  writeFileSync(join(staged,name),"changed");
  assert.throws(()=>verifyPreviewPackage(staged,accepted,true),/Unexpected preview metadata/);
  writeFileSync(join(staged,name),value);
 }
}));
test("non-Cloudflare package rejects unreviewed redirects",()=>fixture(({accepted,staged})=>{
 assert.equal(verifyPreviewPackage(staged,accepted,false).files.length,3);
 writeFileSync(join(staged,"_redirects"),"/* /index.html 200");
 assert.throws(()=>verifyPreviewPackage(staged,accepted,false),/Unexpected static output/);
},false));
