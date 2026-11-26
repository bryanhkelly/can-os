import {execFileSync,spawnSync} from "node:child_process";
import {readFileSync,lstatSync,mkdtempSync,rmSync,cpSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import {isDeepStrictEqual} from "node:util";
import {releaseErrors} from "./release-contract.mjs";
import {staticManifest} from "./static-manifest.mjs";
import {cloudflarePreviewConfig} from "./cloudflare-preview-config.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"}).trim();
const head=git("rev-parse","HEAD"),out=join(root,"acceptance-artifacts/storybook-release");
const receipt=JSON.parse(readFileSync(join(out,"receipt.json"),"utf8"));
const manifest=staticManifest(join(root,"storybook-static"));
const errors=releaseErrors(receipt,head,manifest.digest,git("status","--porcelain","--untracked-files=normal")==="");
if(errors.length)throw Error(errors.join("\n"));
const config=join(out,"wrangler.storybook-"+head.slice(0,12)+".json");
const expected=cloudflarePreviewConfig(head);
if(!isDeepStrictEqual(JSON.parse(readFileSync(config,"utf8")),expected))throw Error("Unexpected Worker configuration. Refusing to deploy.");
const assets=join(out,"cloudflare-preview-"+head.slice(0,12));
const check=mkdtempSync(join(tmpdir(),"storybook-deploy-check-"));
try{
 if(lstatSync(assets).isSymbolicLink())throw Error("Unexpected symbolic link in preview assets");
 cpSync(assets,check,{recursive:true,verbatimSymlinks:true});
 for(const name of ["_headers","_redirects","robots.txt"]){
  if(!lstatSync(join(check,name)).isFile())throw Error("Invalid preview metadata: "+name);
  rmSync(join(check,name));
 }
 const staged=staticManifest(check);
 const expectedFiles=manifest.files.filter(file=>!file.path.endsWith(".map"));
 if(!isDeepStrictEqual(staged.files,expectedFiles))throw Error("Preview assets differ from accepted catalog.");
}finally{rmSync(check,{recursive:true,force:true});}
const override=process.env.WRANGLER_CI_OVERRIDE_NAME;
if(override&&override!==expected.name)throw Error("Cloudflare build target mismatch. Refusing to deploy to "+override);
const wrangler=join(root,"node_modules/wrangler/bin/wrangler.js");
console.log("Deploying dedicated Worker becomuna-storybook; public URLs disabled.");
const result=spawnSync(process.execPath,[wrangler,"deploy","--config",config],{cwd:root,stdio:"inherit",windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
