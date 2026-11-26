import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync,mkdirSync,copyFileSync,existsSync,renameSync,rmSync,mkdtempSync} from "node:fs";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {releaseErrors} from "./release-contract.mjs";
import {staticManifest} from "./static-manifest.mjs";
import {cloudflarePreviewConfig} from "./cloudflare-preview-config.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const out=join(root,"acceptance-artifacts/storybook-release");
const source=join(root,"storybook-static"),receipt=JSON.parse(readFileSync(join(out,"receipt.json"),"utf8"));
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const head=git("rev-parse","HEAD"),manifest=staticManifest(source);
const errors=releaseErrors(receipt,head,manifest.digest,git("status","--porcelain","--untracked-files=normal")==="");
if(errors.length)throw Error(errors.join("\n"));
const cloudflare=process.argv.includes("--cloudflare");
const prefix=cloudflare?"cloudflare-preview-":"private-preview-";
const destination=join(out,prefix+head.slice(0,12));
if(existsSync(destination))throw Error("Private preview package already exists: "+destination);
const staging=mkdtempSync(join(out,".private-preview-"));
try{
 for(const file of manifest.files){
  if(file.path.endsWith(".map"))continue;
  const target=join(staging,file.path);mkdirSync(dirname(target),{recursive:true});
  copyFileSync(join(source,file.path),target);
 }
 const staged=staticManifest(staging);
 const expected=manifest.files.filter(file=>!file.path.endsWith(".map"));
 if(JSON.stringify(staged.files)!==JSON.stringify(expected))throw Error("Copied static output changed");
 writeFileSync(join(staging,"_headers"),`/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex, nofollow, noarchive
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: connect-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; frame-src 'self' blob:; font-src 'self' data:; img-src 'self' data: blob:; media-src 'self' data: blob:; worker-src 'self' blob:
`);
 writeFileSync(join(staging,"robots.txt"),"User-agent: *\nDisallow: /\n");
 renameSync(staging,destination);
 writeFileSync(join(out,prefix+head.slice(0,12)+".json"),JSON.stringify({commit:head,sourceStaticDigest:manifest.digest,sourceMapsExcluded:true,publication:"not deployed",access:"Private project required for production and previews",receipt:"receipt.json"},null,2)+"\n");
}catch(error){rmSync(staging,{recursive:true,force:true});throw error;}
if(cloudflare){
 const configPath=join(out,"wrangler.storybook-"+head.slice(0,12)+".json");
 writeFileSync(configPath,JSON.stringify(cloudflarePreviewConfig(head),null,2)+"\n");
 console.log("Dedicated Cloudflare configuration: "+configPath);
 console.log('Deploy with: npx wrangler deploy --config "'+configPath+'"');
 console.log("Bootstrap disables workers.dev and preview URLs. Configure Worker-level Cloudflare Access before enabling the workers.dev hostname.");
}
console.log("Private preview package: "+destination);
console.log(cloudflare?"No Cloudflare deployment was performed. Keep the Worker private until Access is configured.":"Do not upload until a separate hosting project is private for every deploy. No hosting action was taken.");
