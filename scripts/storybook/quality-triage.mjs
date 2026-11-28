import {readFileSync,mkdirSync,writeFileSync,existsSync} from "node:fs";
import {resolve,relative} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../../",import.meta.url));
const normalize=s=>String(s??"").replaceAll("\\","/").replace(/\x1b\[[0-9;]*m/g,"");
export function aggregateFailures(report){
 if(!Array.isArray(report?.testResults))throw Error("Missing Vitest testResults");
 const groups=new Map(),failed=new Set();
 function add(category,signature,story,detail){
  const key=category+" | "+signature;
  if(!groups.has(key))groups.set(key,{category,signature,stories:new Set(),examples:[]});
  const group=groups.get(key);group.stories.add(story);
  if(group.examples.length<5&&!group.examples.some(e=>e.story===story&&e.detail===detail))group.examples.push({story,detail});
 }
 for(const file of report.testResults){
  const path=normalize(file.name).split("/src/").at(-1);
  const assertions=file.assertionResults??[];
  for(const [i,test] of assertions.entries()){
   if(test.status!=="failed")continue;
   const story=path+" # "+(test.fullName??test.title??i);failed.add(story);
   const message=normalize((test.failureMessages??[]).join("\n"));
   const overlay=/vite-error-overlay|Storybook Vite runtime error overlay:/i.test(message);
   if(overlay)add("fixture/runtime","Vite error overlay (inspect underlying runtime diagnostic)",story,message.slice(0,2400));
   const rules=[...new Set([...message.matchAll(/rules\/axe\/[^/]+\/([a-z][a-z0-9-]+)/g)].map(m=>m[1]))].filter(rule=>!(overlay&&rule==="scrollable-region-focusable"));
   if(rules.length){
    for(const rule of rules){
     if(rule==="color-contrast"){
      const colors=[...message.matchAll(/foreground color:\s*(#[0-9a-f]{6}),\s*background color:\s*(#[0-9a-f]{6})/gi)];
      if(colors.length)for(const m of colors)add("accessibility",rule+" "+m[1].toLowerCase()+" on "+m[2].toLowerCase(),story,m[0]);
      else add("accessibility",rule,story,message.slice(0,1200));
     }else add("accessibility",rule,story,message.slice(0,1200));
    }
   }
   if((!rules.length&&!overlay)||/TestingLibraryElementError|AssertionError:|TypeError:|ReferenceError:|Storybook fixture isolation:/i.test(message)){
    const line=message.split("\n").find(x=>/TestingLibraryElementError|AssertionError:|TypeError:|ReferenceError:|Storybook fixture isolation:|Error:/.test(x))??message.split("\n")[0]??"Unclassified";
    const category=/fixture isolation|Cannot resolve|Could not resolve|Failed to fetch dynamically|No QueryClient|RouterProvider|context provider/i.test(message)?"fixture/runtime":"interaction";
    add(category,line.trim().slice(0,180)||"Unclassified",story,message.slice(0,1200));
   }
  }
  if(file.status==="failed"&&!assertions.some(t=>t.status==="failed")){
   const story=path+" # suite";failed.add(story);
   const detail=normalize(file.message??"Suite failed without assertion results");
   add("suite/runtime",detail.split("\n")[0].slice(0,180),story,detail.slice(0,1200));
  }
 }
 return {reportedFailedTests:report.numFailedTests??null,failedStories:failed.size,groups:[...groups.values()].map(g=>({...g,affectedStories:g.stories.size,stories:[...g.stories].sort()})).sort((a,b)=>b.affectedStories-a.affectedStories||a.signature.localeCompare(b.signature)),note:"Groups overlap. Counts are affected stories, not proven independent root causes."};
}
export function markdownReport(result){
 const esc=s=>String(s).replaceAll("|","\\|").replaceAll("\n"," ");
 return ["# Storybook quality triage","","Failed assertions reported: "+(result.reportedFailedTests??"unknown"),"Distinct failing story/suite identifiers: "+result.failedStories,"",result.note,"","| Category | Signature | Affected stories |","| --- | --- | ---: |",...result.groups.map(g=>"| "+esc(g.category)+" | "+esc(g.signature)+" | "+g.affectedStories+" |"),""].join("\n");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=resolve(root,process.argv[2]??"acceptance-artifacts/storybook-interaction-results.json");
 if(!existsSync(input))throw Error("Missing interaction result: "+relative(root,input));
 const result=aggregateFailures(JSON.parse(readFileSync(input,"utf8")));
 const out=resolve(root,"acceptance-artifacts/storybook-quality");
 mkdirSync(out,{recursive:true});
 writeFileSync(resolve(out,"triage.json"),JSON.stringify(result,null,2)+"\n");
 writeFileSync(resolve(out,"triage.md"),markdownReport(result));
 console.log(markdownReport(result));
}
