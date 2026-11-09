#!/usr/bin/env node
/**
 * Pure read-only CAN OS production status probe.
 * Runs from GitHub Actions, not from an authenticated browser.
 * Writes only safe aggregate status to a GitHub issue; never calls fal.ai
 * and never reads or changes Cloudflare, R2 or API credentials.
 */
import {writeFile} from "node:fs/promises";
const templates=["heritage","community","modern","bright-futures","summit","classic","campus"];
const roles=["hero","story_01","story_02","program_01","program_02","program_03",
  "community_01","community_02","admissions","portrait_01","portrait_02","portrait_03"];
const base="https://can-os.bryanhkelly.workers.dev";
const savedAt=new Date().toISOString();
const safe=(value)=>String(value??"").replace(/[\r\n<>|`]/g," ").slice(0,170);
const rows=[],failures=[];
let counted=0;
for(const template of templates){
  const url=`${base}/template-photo-status?template=${template}`;
  try{
    const response=await fetch(url,{redirect:"error",
      headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(15000),
    });
    if(!response.ok)throw Error("status HTTP "+response.status);
    const data=await response.json();
    if(data.template!==template||!Array.isArray(data.ready))
      throw Error("unexpected status payload");
    const valid=data.ready.every(role=>roles.includes(role));
    if(!valid)throw Error("unexpected role name in readiness list");
    const hero=data.ready.includes("hero");
    counted+=data.ready.length;
    let served="Not checked";
    if(hero){
      const image=await fetch(`${base}/template-photo/${template}/hero?v=20261109`,
        {redirect:"error",signal:AbortSignal.timeout(16000)});
      served=image.ok && /^image\/(jpeg|png|webp)/i.test(
        image.headers.get("content-type")??"")
        ? "HTTP 200 media" : `HTTP ${image.status} (${safe(image.headers.get("content-type"))})`;
      if(served!=="HTTP 200 media")failures.push(template+" hero not served as valid media");
      await image.body?.cancel();
    }
    rows.push({template,ready:data.ready.length,hero,served,
      reset:data.photoReset??null,campaign:data.campaign??null,
      heroStatus:data.heroStatus??"unknown",error:data.heroError??null,
      newSubmissionsEnabled:data.newSubmissionsEnabled});
  }catch(e){
    const error=e instanceof Error?e.message:"unknown error";
    failures.push(template+": "+error);
    rows.push({template,ready:0,hero:false,served:"Not checked",
      reset:null,campaign:null,error});
  }
}
const single=rows.find(row=>row.reset!==null);
const reset=single?.reset;
const campaign=rows.find(row=>row.campaign!==null)?.campaign;
const observed=rows.filter(row=>row.reset!==null).length;
let phase="Waiting for deployed API";
if(reset?.phase==="blocked")phase="BLOCKED — R2 archive/reset";
else if(reset?.phase==="running")phase="Archiving old R2 images";
else if(reset?.phase==="completed" && counted===84)phase="All 84 master roles present";
else if(reset?.phase==="completed" && counted>0)phase="Production in progress";
else if(reset?.phase==="completed")phase="Cleanup done — awaiting fresh images";
const line=(row)=>
  `| ${row.template} | ${row.ready}/12 | ${safe(row.heroStatus)} | ${safe(row.served)} | ${safe(row.error)||"—"} |`;
const notes=[];
if(!reset)notes.push("The live deployment may not yet include the new `photoReset` status field.");
if(reset?.phase==="blocked")
  notes.push("Reset blocker: "+safe(reset.reason));
if(failures.length)notes.push("HTTP/readiness failures: "+failures.map(safe).join("; "));
const report=`# CAN OS — 84-image production
**Last checked (UTC):** ${savedAt}

**Actual live state:** ${safe(phase)}

| Measure | Observed |
| :-- | --: |
| R2 roles detected | **${counted}/84** |
| Templates returning reset metadata | ${observed}/7 |
| Reset checkpoint | ${safe(reset?.phase??"not deployed / unavailable")} |
| Archived objects | ${safe(reset?.copied??"unknown")} |
| Removed legacy objects | ${safe(reset?.removed??"unknown")} |
| In-flight generations | ${safe(campaign?.inFlight??"unknown")} |
| Rejected generations | ${safe(campaign?.rejected??"unknown")} |
| New submission switch | ${safe(campaign?.newSubmissionsEnabled??"unknown")} |

## Individual templates

| Template | Ready | Hero state | Live media check | Error |
| :-- | --: | :-- | :-- | :-- |
${rows.map(line).join("\n")}

## Diagnostics
${notes.length?notes.map(note=>"- "+note).join("\n"):"No read-only HTTP/status errors detected."}

[Cloudflare Summit status](${base}/template-photo-status?template=summit) · [Community status](${base}/template-photo-status?template=community) · [Actions runs](https://github.com/bryanhkelly/can-os/actions/workflows/photo-live-status.yml)

_This report uses GET requests only. It neither submits new fal.ai requests nor changes R2 objects. It makes no assertion about a successful 4K resolution until the separate file-level checks complete._
`;
await writeFile(process.env.PHOTO_REPORT_PATH??"/tmp/can-os-photo-live.md",report);
console.log(JSON.stringify({time:savedAt,phase,ready:counted,reset:reset?.phase,
  archived:reset?.copied,removed:reset?.removed,campaign,failures},null,2));
