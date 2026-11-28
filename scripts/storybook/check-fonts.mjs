import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const provenance=JSON.parse(readFileSync(resolve(root,".storybook/assets/fonts/licenses/provenance.json"),"utf8"));
const errors=[];
for(const file of provenance.files){
 const data=readFileSync(resolve(root,file.path));
 const actual=createHash("sha1").update("blob "+data.length+"\0").update(data).digest("hex");
 if(actual!==file.gitBlobSha)errors.push("Bundled font bytes differ from pinned upstream: "+file.path);
}
for(const name of ["dm-sans","instrument-serif","jetbrains-mono"]){
 const license=readFileSync(resolve(root,".storybook/assets/fonts/licenses/"+name+"-OFL.txt"),"utf8");
 if(!license.includes("SIL OPEN FONT LICENSE"))errors.push("Missing license: "+name);
}
const head=readFileSync(resolve(root,".storybook/preview-head.html"),"utf8");
if(/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(head))errors.push("External typography request remains");
console.log(JSON.stringify({files:provenance.files.length,revision:provenance.revision,errors},null,2));
if(errors.length)process.exitCode=1;
