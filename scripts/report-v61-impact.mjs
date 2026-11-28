import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {createInventory} from "./lib/v61-source-audit.mjs";
import {createImpactReport} from "./lib/v61-impact-report.mjs";
const root=fileURLToPath(new URL("../",import.meta.url));
const args=process.argv.slice(2);
if(args.some(arg=>!arg.startsWith("--component="))||args.length>1)throw Error("Usage: npm run design:impact -- [--component=src/components/...tsx]");
const registry=JSON.parse(readFileSync(join(root,"docs/design-coverage/v61-registry.json"),"utf8"));
const report=createImpactReport(createInventory(root,{includeStoryImpact:true}),registry);
const target=args[0]?.slice("--component=".length)?.replaceAll("\\","/");
if(args.length){
 const component=report.components.find(row=>row.path===target);
 if(!component)throw Error("Unknown component source path: "+target);
 console.log(JSON.stringify({kind:report.kind,component,limitations:report.limitations},null,2));
}else console.log(JSON.stringify(report,null,2));
