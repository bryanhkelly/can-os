import type {Reporter,TestCase,TestResult,FullResult} from "@playwright/test/reporter";
import {mkdirSync,writeFileSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {z} from "zod";
const uuid=z.string().uuid(),revision=z.string().regex(/^[0-9a-f]{40}$/);
const schedule=z.object({revision,sites:z.array(z.object({siteId:uuid,classId:uuid,sessions:z.array(z.object({classSessionId:uuid,requestId:uuid}).strict()).length(4)}).strict()).length(2),deliveryVerified:z.literal(false)}).strict();
const delivery=z.object({revision,classId:uuid,siteId:uuid,classSessionId:uuid,requestId:uuid,roomClosed:z.literal(true),participants:z.number().int().min(2).max(20),paired:z.number().int().min(1),corrected:z.number().int().min(1),playbackVerified:z.literal(false)}).strict();
// Persist only the explicitly allowlisted receipt from a successful test run.
// No request bodies, raw reporter output, credentials or signed URLs.
export default class ReceiptReporter implements Reporter{
 private receipts:{name:string;body:Buffer}[]=[];
 onTestEnd(test:TestCase,result:TestResult){
  if(result.status!=="passed"||test.expectedStatus!=="passed"||result.retry!==0)return;
  for(const a of result.attachments)if((a.name==="schedule-receipts"||a.name==="session-receipt")&&a.body)this.receipts.push({name:a.name,body:a.body});
 }
 onEnd(result:FullResult){
  if(result.status!=="passed")return;
  try{
   if(this.receipts.length!==1)throw Error();
   const r=this.receipts[0]!;
   const payload=r.name==="schedule-receipts"?schedule.parse(JSON.parse(r.body.toString("utf8"))):delivery.parse(JSON.parse(r.body.toString("utf8")));
   if(payload.revision!==process.env.CAN_RELEASE_SOURCE_SHA)throw Error();
   const directory=join(process.cwd(),"acceptance-artifacts","nest-pilot2",payload.revision);
   mkdirSync(directory,{recursive:true,mode:0o700});
   if(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink())throw Error();
   const filename="sites" in payload?"schedule.json":"session-"+payload.classSessionId+".json";
   writeFileSync(join(directory,filename),JSON.stringify(payload,null,2)+"\n",{flag:"wx",mode:0o600});
  }catch{
   console.error("Blocked: unable to persist unique successful classroom receipt.");
   return {status:"failed" as const};
  }
 }
}
