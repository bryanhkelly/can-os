import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {resolve,dirname} from "node:path";
const root=fileURLToPath(new URL("../../",import.meta.url));
const read=path=>JSON.parse(readFileSync(path,"utf8"));
const pkg=read(resolve(root,"package.json")),lock=read(resolve(root,"package-lock.json"));
const expected=pkg.devDependencies.playwright;
const names=["playwright","@playwright/test","playwright-core"];
const errors=[];
if(!/^\d+\.\d+\.\d+$/.test(expected)||pkg.devDependencies["@playwright/test"]!==expected)errors.push("Pin Playwright and its test runner to the same exact version.");
for(const name of names){
 const entries=Object.entries(lock.packages).filter(([path])=>path==="node_modules/"+name||path.endsWith("/node_modules/"+name));
 if(entries.length!==1||entries[0]?.[0]!=="node_modules/"+name||entries[0]?.[1]?.version!==expected)errors.push("Unexpected lockfile resolutions for "+name+": "+entries.map(([path,value])=>path+"="+value.version).join(", "));
}
const appRequire=createRequire(resolve(root,"package.json"));
for(const consumer of ["playwright","@playwright/test","@vitest/browser-playwright"]){
 const consumerEntry=appRequire.resolve(consumer);
 const consumerRequire=createRequire(consumerEntry);
 for(const name of ["playwright","playwright-core"]){
  const path=consumerRequire.resolve(name+"/package.json"),version=read(path).version;
  if(version!==expected||path!==appRequire.resolve(name+"/package.json"))errors.push(consumer+" resolves a different "+name+": "+path+" ("+version+")");
 }
}
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}else console.log("Playwright CLI, test runner and Vitest share one installed runtime: "+expected);
