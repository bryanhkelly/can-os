import {test} from "node:test";
import assert from "node:assert/strict";
import {cloudflarePreviewConfig} from "./cloudflare-preview-config.mjs";
test("standalone Worker has no public routes or application bindings",()=>{
 const config=cloudflarePreviewConfig("a".repeat(40));
 assert.deepEqual(config,{name:"becomuna-storybook",compatibility_date:"2026-11-06",workers_dev:false,preview_urls:false,assets:{directory:"./cloudflare-preview-aaaaaaaaaaaa",html_handling:"none",not_found_handling:"none"}});
 assert.equal(config.main,undefined);
 assert.equal(config.routes,undefined);
 assert.equal(config.r2_buckets,undefined);
 assert.equal(config.vars,undefined);
});
test("invalid commit cannot select an arbitrary asset path",()=>{
 for(const value of ["main","../../dist","a".repeat(39),"A".repeat(40),null])assert.throws(()=>cloudflarePreviewConfig(value),/Exact Git commit required/);
});
