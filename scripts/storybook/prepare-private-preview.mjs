import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,renameSync,rmSync,mkdtempSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {releaseErrors,releasePrerequisiteErrors} from "./release-contract.mjs";
import {staticManifest} from "./static-manifest.mjs";
import {cloudflarePreviewConfig} from "./cloudflare-preview-config.mjs";
import {verifyPreviewPackage,writePreviewMetadata} from "./preview-package.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const out=join(root,"acceptance-artifacts/storybook-release");
const source=join(root,"storybook-static"),receipt=JSON.parse(readFileSync(join(out,"receipt.json"),"utf8"));
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const head=git("rev-parse","HEAD"),clean=git("status","--porcelain","--untracked-files=normal")==="";
const prerequisites=releasePrerequisiteErrors(receipt,head,clean);
if(prerequisites.length)throw Error(prerequisites.join("\n"));
const manifest=staticManifest(source);
const errors=releaseErrors(receipt,head,manifest.digest,clean);
if(errors.length)throw Error(errors.join("\n"));
const cloudflare=process.argv.includes("--cloudflare");
const prefix=cloudflare?"cloudflare-preview-":"private-preview-";
const destination=join(out,prefix+head.slice(0,12));
if(existsSync(destination)){
 verifyPreviewPackage(destination,manifest,cloudflare);
 console.log("Reusing verified private preview package: "+destination);
}else{
const staging=mkdtempSync(join(out,".private-preview-"));
try{
 for(const file of manifest.files){
  if(file.path.endsWith(".map"))continue;
  const target=join(staging,file.path);mkdirSync(dirname(target),{recursive:true});
  copyFileSync(join(source,file.path),target);
 }
 writePreviewMetadata(staging,cloudflare);
 verifyPreviewPackage(staging,manifest,cloudflare);
 renameSync(staging,destination);
}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
}
writeFileSync(join(out,prefix+head.slice(0,12)+".json"),JSON.stringify({commit:head,sourceStaticDigest:manifest.digest,sourceMapsExcluded:true,publication:"not deployed",access:"Private project required for production and previews",receipt:"receipt.json"},null,2)+"\n");
if(cloudflare){
 const configPath=join(out,"wrangler.storybook-"+head.slice(0,12)+".json");
 writeFileSync(configPath,JSON.stringify(cloudflarePreviewConfig(head),null,2)+"\n");
 console.log("Dedicated Cloudflare configuration: "+configPath);
 console.log('Deploy with: npx wrangler deploy --config "'+configPath+'"');
 console.log("Bootstrap disables workers.dev and preview URLs. Configure Worker-level Cloudflare Access before enabling the workers.dev hostname.");
}
console.log("Private preview package: "+destination);
console.log(cloudflare?"No Cloudflare deployment was performed. Keep the Worker private until Access is configured.":"Do not upload until a separate hosting project is private for every deploy. No hosting action was taken.");
