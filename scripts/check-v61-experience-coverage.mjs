import {readFileSync,readdirSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {validateExperienceRegistry} from "./lib/v61-experience-registry.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const registry=JSON.parse(readFileSync(join(root,"docs/design-coverage/v61-registry.json"),"utf8"));
function walk(dir){
 return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
   const path=join(dir,entry.name);
   return entry.isDirectory()?walk(path):[path];
 });
}
const paths=walk(join(root,"src/routes")).filter(p=>p.endsWith(".tsx")&&!/\.(stories|test|spec)\.tsx$/.test(p)).map(p=>relative(root,p).replaceAll("\\","/")).sort();
const report=validateExperienceRegistry(registry,paths,file=>readFileSync(join(root,file),"utf8"));
console.log(JSON.stringify(report,null,2));
if(report.errors.length||(process.argv.includes("--strict")&&report.outstanding.length))process.exitCode=1;
