// Run from the clean QA checkout; only this trusted operator process sees the
// parent file. The runtime receives only short-lived prefix-scoped credentials.
import {readFileSync,writeFileSync,renameSync,lstatSync} from "node:fs";
import {resolve} from "node:path";
import {parseEnv} from "node:util";
import {randomUUID} from "node:crypto";
import {mintQaStorage,assertQaStorageScope,QA_BRANCH} from "./pilot-qa-storage-credentials.mjs";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
import {signPrivateObjectUrl} from "../../src/platform/storage/r2.ts";
try {
  if(process.argv.length!==3)throw Error("Supply path to existing local R2 configuration file");
  const file=resolve(".env.pilot-qa"),source=resolve(process.argv[2]);
  if(source===file||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())
    throw Error("Separate existing configuration required");
  const raw=readFileSync(file,"utf8"),config=parseEnv(raw);
  if(config.CAN_PILOT_QA_BRANCH_ID!==QA_BRANCH||config.APP_ENV!=="test"||
    config.NODE_ENV!=="test"||config.CAN_TEST_DB_WRITES_ENABLED!=="true")throw Error("Invalid QA target");
  await verifyAdmissionsNeonBranch({...config,CAN_ADMISSIONS_TEST_BRANCH_ID:QA_BRANCH});
  const parent=parseEnv(readFileSync(source,"utf8"));
  const scoped=mintQaStorage(parent);
  assertQaStorageScope(scoped);
  // Validate actual R2 authorization and URL signing before changing the file.
  Object.assign(process.env,scoped,{APP_ENV:"test",NODE_ENV:"test",
    CAN_TEST_DB_WRITES_ENABLED:"true",CAN_PILOT_QA_BRANCH_ID:QA_BRANCH});
  const key="storage-probe/"+randomUUID();
  const keyPattern=/^storage-probe\/[a-f0-9-]{36}$/;
  const body="Synthetic private QA storage readiness probe";
  const put=await fetch(signPrivateObjectUrl({method:"PUT",key,keyPattern,
    contentType:"text/plain",preventOverwrite:true}),{
    method:"PUT",headers:{"Content-Type":"text/plain","If-None-Match":"*"},body});
  if(!put.ok){console.error("QA storage PUT rejected: HTTP "+put.status);process.exitCode=1;}
  else{
    const get=await fetch(signPrivateObjectUrl({method:"GET",key,keyPattern}));
    if(!get.ok||await get.text()!==body)throw Error("QA storage readback failed");
    const head=await fetch(signPrivateObjectUrl({method:"HEAD",key,keyPattern}),{method:"HEAD"});
    if(!head.ok||Number(head.headers.get("content-length"))!==Buffer.byteLength(body))throw Error("QA storage metadata check failed");
    const merged=Object.entries(scoped).reduce((text,[k,v])=>{
      const line=new RegExp("^"+k+"=[^\\r\\n]*","m");
      return line.test(text)?text.replace(line,()=>k+"="+v):text.trimEnd()+"\n"+k+"="+v+"\n";
    },raw);
    const tmp=file+"."+randomUUID()+".tmp";
    writeFileSync(tmp,merged,{flag:"wx",mode:0o600});
    renameSync(tmp,file);
    console.log("Shared QA storage verified (PUT, GET, HEAD). Scoped credentials saved; existing QA keys preserved.");
  }
}catch{
  console.error("QA storage setup blocked. Check the source R2 settings, isolated branch and bucket access. No credentials printed.");
  process.exitCode=1;
}
