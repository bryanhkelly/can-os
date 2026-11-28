import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createInventory} from "../scripts/lib/v61-source-audit.mjs";
import {createImpactReport} from "../scripts/lib/v61-impact-report.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
export const inventoryModuleId="virtual:becomuna-engineering-inventory";
export function sourceIdentity(projectRoot){
 const git=(...args)=>execFileSync("git",args,{cwd:projectRoot,encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
 const commit=git("rev-parse","HEAD");
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error("Invalid source commit");
 return {commit,clean:git("status","--porcelain","--untracked-files=normal")===""};
}
export function engineeringSnapshot(projectRoot=root){
 const identity=sourceIdentity(projectRoot);
 const registry=JSON.parse(readFileSync(join(projectRoot,"docs/design-coverage/v61-registry.json"),"utf8"));
 const impact=createImpactReport(createInventory(projectRoot,{includeStoryImpact:true}),registry);
 const after=sourceIdentity(projectRoot);
 if(identity.commit!==after.commit||identity.clean!==after.clean)throw Error("Source identity changed during engineering inventory");
 // Intentionally serialize only the derived report and source identity: no
 // absolute checkout path, source text, environment variables or credentials.
 return {schemaVersion:1,designSystem:"V6.1",source:identity,impact};
}
export function engineeringInventoryPlugin({projectRoot=root}={}){
 let snapshot;
 return {name:"becomuna-storybook-engineering-inventory",
  resolveId(id){return id===inventoryModuleId?"\0"+id:null;},
  load(id){
   if(id!=="\0"+inventoryModuleId)return null;
   snapshot??=engineeringSnapshot(projectRoot);
   return "export default "+JSON.stringify(snapshot)+";";
  }
 };
}
