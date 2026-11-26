import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {checkStorybookIndex} from "./index-contract.mjs";
const root=fileURLToPath(new URL("../../",import.meta.url));
const index=JSON.parse(readFileSync(resolve(root,"storybook-static/index.json"),"utf8"));
const registry=JSON.parse(readFileSync(resolve(root,"docs/design-coverage/v61-registry.json"),"utf8"));
const report=checkStorybookIndex(index,registry);
const navigation=JSON.parse(readFileSync(resolve(root,"docs/design-coverage/storybook-navigation.json"),"utf8"));
const entries=Object.values(index.entries??{});
const slug=name=>name.replace(/([a-z0-9])([A-Z])/g,"$1-$2").replace(/([A-Z])([A-Z][a-z])/g,"$1-$2").toLowerCase();
for(const migration of navigation.migrations){
 for(const name of migration.exports){
  const entry=entries.find(item=>item.type==="story"&&item.importPath?.replace(/^\.\//,"")===migration.path&&(item.exportName===name||item.id===migration.metaId+"--"+slug(name)));
  if(!entry||entry.title!==migration.title||!entry.id.startsWith(migration.metaId+"--"))report.errors.push("Navigation migration lost story identity: "+migration.path+"#"+name);
 }
}
report.navigationFamilies=navigation.migrations.length;
mkdirSync(resolve(root,"acceptance-artifacts"),{recursive:true});
writeFileSync(resolve(root,"acceptance-artifacts/storybook-index.json"),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(report,null,2));
if(report.errors.length)process.exitCode=1;
