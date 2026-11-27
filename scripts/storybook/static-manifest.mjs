import {createHash} from "node:crypto";
import {readFileSync,readdirSync,lstatSync} from "node:fs";
import {join,relative} from "node:path";
import {isSafeStaticPath} from "./release-contract.mjs";
export function staticManifest(root,{ignoredRootFiles=[]}={}){
 const files=[];
 if(lstatSync(root).isSymbolicLink())throw Error("Static root cannot be a symlink");
 function walk(dir){
  for(const entry of readdirSync(dir,{withFileTypes:true})){
   const file=join(dir,entry.name),path=relative(root,file).replaceAll("\\","/");
   if(ignoredRootFiles.includes(path)&&dir===root){
    if(!entry.isFile()||lstatSync(file).isSymbolicLink())throw Error("Invalid ignored root metadata: "+path);
    continue;
   }
   if(!isSafeStaticPath(path))throw Error("Unexpected static output: "+path);
   if(lstatSync(file).isSymbolicLink())throw Error("Symlink in static output: "+path);
   if(entry.isDirectory()){walk(file);continue;}
   if(!entry.isFile())throw Error("Unsupported static output: "+path);
   const bytes=readFileSync(file);
   files.push({path,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});
  }
 }
 walk(root);
 files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 for(const path of ["index.html","iframe.html","index.json"])if(!files.some(f=>f.path===path))throw Error("Missing static catalog entry: "+path);
 return {files,digest:createHash("sha256").update(JSON.stringify(files)).digest("hex")};
}
