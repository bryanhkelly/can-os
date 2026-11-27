import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,writeFile,mkdir,symlink,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {request} from "node:http";
import {createStorybookStaticServer} from "./static-server.mjs";
import {previewSecurityHeaders} from "./preview-package.mjs";
test("static fixture serving allows assets, never falls back to an application or exposes outside files",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"becomuna-storybook-"));
 const root=join(dir,"static");await mkdir(root);
 await writeFile(join(root,"index.json"),'{"entries":{}}');
 await writeFile(join(root,"index.html"),"<html>fixture</html>");
 await writeFile(join(dir,"private.txt"),"private");
 for(const name of ["credentials.json","private.key","source.js.map","_headers",".env"]){await writeFile(join(root,name),"fixture denied");}
 // Windows directory junctions exercise realpath containment without requiring
 // administrator privileges or Developer Mode for file symlinks.
 const escapePath=process.platform==="win32"?"/escape/private.txt":"/escape.txt";
 if(process.platform==="win32"){
  const outside=join(dir,"outside");await mkdir(outside);
  await writeFile(join(outside,"private.txt"),"private");
  await symlink(outside,join(root,"escape"),"junction");
 }else{
  await symlink(join(dir,"private.txt"),join(root,"escape.txt"));
 }
 const server=await createStorybookStaticServer(root);
 try{
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  const base="http://127.0.0.1:"+port;
  const rootResponse=await fetch(base+"/");assert.equal(rootResponse.status,200);assert.match(await rootResponse.text(),/fixture/);
  for(const [name,value] of Object.entries(previewSecurityHeaders))assert.equal(rootResponse.headers.get(name),value);
  assert.match(rootResponse.headers.get("content-security-policy"),/form-action 'none'/);
  const json=await fetch(base+"/index.json");assert.match(json.headers.get("content-type"),/application\/json/);assert.equal(json.headers.get("cache-control"),"no-store");
  assert.equal((await fetch(base+"/api/private")).status,404);
  assert.equal((await fetch(base+"/missing")).status,404);
  for(const name of ["credentials.json","private.key","source.js.map","_headers"])assert.equal((await fetch(base+"/"+name)).status,404,name);
  assert.equal((await fetch(base+"/.env")).status,400);
  assert.equal((await fetch(base+"/index.json",{method:"POST"})).status,405);
  assert.equal((await fetch(base+escapePath)).status,404);
  assert.equal((await fetch(base+"/index.html",{method:"HEAD"})).status,200);
  const code=await new Promise((resolve,reject)=>{const req=request({hostname:"127.0.0.1",port,path:"/%2e%2e/private.txt"},res=>{res.resume();resolve(res.statusCode);});req.on("error",reject);req.end();});
  assert.equal(code,400);
 }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
});
