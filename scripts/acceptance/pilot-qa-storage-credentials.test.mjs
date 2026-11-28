import {test} from "node:test";
import assert from "node:assert/strict";
import {mintQaStorage,assertQaStorageScope,QA_PREFIX} from "./pilot-qa-storage-credentials.mjs";
const parent={CAN_R2_ACCOUNT_ID:"a".repeat(32),CAN_R2_BUCKET:"existing-private",
 CAN_R2_ACCESS_KEY_ID:"parent-access",CAN_R2_SECRET_ACCESS_KEY:"parent-secret"};
const now=1800000000;
test("temporary credentials carry the exact prefix and omit the parent secret",()=>{
 const result=mintQaStorage(parent,now);
 assert.notEqual(result.CAN_R2_SECRET_ACCESS_KEY,parent.CAN_R2_SECRET_ACCESS_KEY);
 assert.doesNotThrow(()=>assertQaStorageScope(result,now));
 const token=Buffer.from(result.CAN_R2_SESSION_TOKEN,"base64").toString();
 const claims=JSON.parse(Buffer.from(token.slice(4).split(".")[1],"base64url"));
 assert.deepEqual(claims.paths,{prefixPaths:[QA_PREFIX],objectPaths:[]});
 assert.deepEqual(claims.actions,["GetObject","HeadObject","PutObject"]);
 assert.equal(claims.exp-now,4*3600);
});
test("reject expired, broad, missing, mismatched or nested temporary credentials",()=>{
 const result=mintQaStorage(parent,now);
 assert.throws(()=>assertQaStorageScope(result,now+4*3600));
 assert.throws(()=>assertQaStorageScope(parent,now));
 assert.throws(()=>assertQaStorageScope({...result,CAN_R2_BUCKET:"other-bucket"},now));
 assert.throws(()=>assertQaStorageScope({...result,CAN_R2_SECRET_ACCESS_KEY:parent.CAN_R2_SECRET_ACCESS_KEY},now));
 assert.throws(()=>mintQaStorage(result,now));
});
