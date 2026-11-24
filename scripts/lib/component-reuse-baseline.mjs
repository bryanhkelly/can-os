import { execFileSync } from "node:child_process";
import { indexSource, isProductionSource } from "./component-reuse-fingerprints.mjs";

function git(root,args,input) {
  return execFileSync("git",args,{cwd:root,input,maxBuffer:128*1024*1024});
}
export function resolveReuseBase(root, explicit=process.env.V61_BASE_REF) {
  const ref = explicit || git(root,["merge-base","HEAD","origin/main"]).toString().trim();
  const head = git(root,["rev-parse","HEAD"]).toString().trim();
  const base = git(root,["rev-parse","--verify",ref+"^{commit}"]).toString().trim();
  return !explicit && base===head ? git(root,["rev-parse","HEAD^"]).toString().trim() : base;
}
/** Read committed blobs without switching branches or invoking shell interpolation. */
export function indexCommittedSources(root, base) {
  const entries = git(root,["ls-tree","-r","-z",base,"--","src"]).toString().split("\0")
    .filter(Boolean).map(row=>{
      const tab=row.indexOf("\t");
      const [mode,type,sha]=row.slice(0,tab).split(" ");
      return {mode,type,sha,path:row.slice(tab+1)};
    }).filter(row=>row.type==="blob"&&row.mode.startsWith("100")&&isProductionSource(row.path));
  const index = new Map();
  for(let start=0;start<entries.length;start+=100){
    const batch=entries.slice(start,start+100);
    const bytes=git(root,["cat-file","--batch"],batch.map(row=>row.sha).join("\n")+"\n");
    let offset=0;
    for(const row of batch){
      const end=bytes.indexOf(10,offset);
      if(end<0)throw new Error("Incomplete Git blob header for "+row.path);
      const [sha,type,length]=bytes.subarray(offset,end).toString().split(" ");
      const size=Number(length);
      offset=end+1;
      if(sha!==row.sha||type!=="blob"||!Number.isSafeInteger(size)||size<0||
        offset+size>=bytes.length||bytes[offset+size]!==10)throw new Error("Invalid Git blob for "+row.path);
      indexSource(row.path,bytes.subarray(offset,offset+size).toString("utf8"),index);
      offset+=size+1;
    }
    if(offset!==bytes.length)throw new Error("Unexpected trailing Git blob data");
  }
  return index;
}
