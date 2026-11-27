import {test} from "node:test";
import assert from "node:assert/strict";
import {isSafeStaticPath,releaseErrors,releasePrerequisiteErrors,requiredStages} from "./release-contract.mjs";
const head="a".repeat(40),digest="b".repeat(64);
const receipt={version:1,commit:head,status:"passed",staticDigest:digest,stages:requiredStages.map(name=>({name,status:"passed"}))};
test("exact commit, complete stage receipt and output identity are mandatory",()=>{
 assert.deepEqual(releaseErrors(receipt,head,digest,true),[]);
 assert.ok(releaseErrors(receipt,"c".repeat(40),digest,true).length);
 assert.ok(releaseErrors(receipt,head,"d".repeat(64),true).length);
 assert.ok(releaseErrors(receipt,head,digest,false).length);
 assert.ok(releaseErrors({...receipt,status:"failed"},head,digest,true).length);
 assert.ok(releaseErrors({...receipt,stages:receipt.stages.slice(1)},head,digest,true).length);
});
test("private static export rejects hidden files, secrets, executable source and server configuration",()=>{
 for(const path of ["../private.txt","/etc/passwd","assets/.env","assets\\secret.js","credentials.json","assets/secrets.json","netlify.toml","assets/key.pem","server.ts","db.sql","_redirects","_headers"])assert.equal(isSafeStaticPath(path),false,path);
 for(const path of ["index.html","iframe.html","index.json","assets/story.js","assets/style.css","assets/image.webp","font-licenses/dm-sans-OFL.txt"])assert.equal(isSafeStaticPath(path),true,path);
});

test("failed or missing receipt is rejected before accessing any build output",()=>{
 assert.deepEqual(releasePrerequisiteErrors(receipt,head,true),[]);
 assert.match(releasePrerequisiteErrors(null,head,true).join("\n"),/Acceptance did not pass/);
 assert.match(releasePrerequisiteErrors({...receipt,status:"failed"},head,true).join("\n"),/Acceptance did not pass/);
});
