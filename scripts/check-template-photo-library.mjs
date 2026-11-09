#!/usr/bin/env node
/**
 * Read-only photo release gate. No fal.ai POST, no R2 writes, no private keys.
 * Check all 7 templates and 84 intended roles on the deployed Worker.
 *
 * node scripts/check-template-photo-library.mjs
 * node scripts/check-template-photo-library.mjs --require-heroes
 * node scripts/check-template-photo-library.mjs --require-complete
 * node scripts/check-template-photo-library.mjs --check-responsive
 * node scripts/check-template-photo-library.mjs --require-reset
 */
const base=(process.env.CAN_OS_BASE_URL || "https://can-os.bryanhkelly.workers.dev").replace(/\/$/,"");
const templates=["heritage","community","modern","bright-futures","summit","classic","campus"];
const roles=["hero","story_01","story_02","program_01","program_02","program_03",
  "community_01","community_02","admissions","portrait_01","portrait_02","portrait_03"];
const requireHeroes=process.argv.includes("--require-heroes")||
  process.argv.includes("--require-complete");
const requireComplete=process.argv.includes("--require-complete");
const checkResponsive=process.argv.includes("--check-responsive");
const requireReset=process.argv.includes("--require-reset");
let failed=false,received=0;

for(const template of templates){
  try{
    const response=await fetch(base+"/template-photo-status?template="+template,{
      headers:{"Accept":"application/json"},
      signal:AbortSignal.timeout(20_000),
    });
    if(!response.ok)throw Error("HTTP "+response.status);
    const body=await response.json();
    const ready=Array.isArray(body.ready)?body.ready:[];
    const valid=ready.every(role=>roles.includes(role)) &&
      ready.length===new Set(ready).size;
    if(!valid)throw Error("Unrecognized or duplicated image role");
    received+=ready.length;
    const missing=roles.filter(role=>!ready.includes(role));
    console.log(JSON.stringify({
      template,ready:ready.length,missing,
      heroStatus:body.heroStatus,heroError:body.heroError,
      newSubmissionsEnabled:body.newSubmissionsEnabled,
      responsiveDeliveryEnabled:body.responsiveDeliveryEnabled,
      r2WriteVerified:body.r2WriteVerified,
      photoReset:body.photoReset?.phase,
      removedOldObjects:body.photoReset?.removed,
      uploadRecovery:body.uploadRecovery?.state,
    }));
    if(requireReset &&
       (body.photoReset?.phase!=="completed" ||
        body.newSubmissionsEnabled===true)){
      console.error("Cleanup not complete or paid submissions unexpectedly enabled for "+template);
      failed=true;
    }
    if(body.newSubmissionsEnabled===true)
      console.error("WARNING: paid submissions enabled on "+template);
    if(requireHeroes&&!ready.includes("hero"))failed=true;
    if(requireComplete&&missing.length)failed=true;
    if(checkResponsive&&ready.includes("hero")){
      const variant=await fetch(base+"/template-photo/"+template+"/hero?w=640",{
        signal:AbortSignal.timeout(20_000),
      });
      if(!variant.ok||!variant.headers.get("content-type")?.includes("image/webp")){
        console.error("Responsive variant failed for "+template+
          " with HTTP "+variant.status+" / "+variant.headers.get("content-type"));
        failed=true;
      }
      await variant.body?.cancel();
    }
  }catch(error){
    failed=true;
    console.error("Image status unavailable for "+template+": "+
      (error instanceof Error?error.message:"unknown"));
  }
}
console.log("Verified R2 roles: "+received+"/84 across "+templates.length+" templates");
if(failed)process.exitCode=1;
