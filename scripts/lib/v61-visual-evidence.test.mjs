import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hasReviewedVisualEvidence } from "./v61-visual-evidence.mjs";

const digest = value => createHash("sha256").update(value).digest("hex");
// Synthetic PNG header fixture; this tests metadata, not visual quality.
function header(width) {
  const bytes = Buffer.alloc(33);
  Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(13,8); bytes.write("IHDR",12);
  bytes.writeUInt32BE(width,16); bytes.writeUInt32BE(800,20);
  return bytes;
}
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(),"v61-visual-"));
  try {
    const file = "src/styles.css", source = "body { color: black; }";
    mkdirSync(join(root,"src"));
    mkdirSync(join(root,"docs/verification/screenshots"),{recursive:true});
    writeFileSync(join(root,file),source);
    const screenshots = Object.entries({mobile:390,tablet:768,desktop:1440}).map(([viewport,width])=>{
      const path = "docs/verification/screenshots/"+viewport+".png", bytes = header(width);
      writeFileSync(join(root,path),bytes);
      return {viewport,path,sha256:digest(bytes)};
    });
    const review = {path:file,status:"reviewed",reviewer:"Test reviewer",
      reviewedAt:"2026-11-24T00:00:00Z",sourceSha256:digest(source),screenshots};
    run({root,file,review,valid:reviews=>hasReviewedVisualEvidence(root,reviews,file)});
  } finally { rmSync(root,{recursive:true,force:true}); }
}
test("accepts matching source and viewport artifacts",()=>fixture(({review,valid})=>{
  assert.equal(valid([review]),true);
}));
test("rejects stale source and tampered artifact",()=>fixture(({root,file,review,valid})=>{
  writeFileSync(join(root,review.screenshots[0].path),header(390).subarray(0,32));
  assert.equal(valid([review]),false);
  writeFileSync(join(root,review.screenshots[0].path),header(390));
  writeFileSync(join(root,file),"changed");
  assert.equal(valid([review]),false);
}));
test("rejects duplicate reviews, missing viewports and mismatched viewport dimensions",()=>fixture(({root,review,valid})=>{
  assert.equal(valid([review,review]),false);
  assert.equal(valid([{...review,screenshots:review.screenshots.slice(1)}]),false);
  const item=review.screenshots[0],bytes=header(500);
  writeFileSync(join(root,item.path),bytes);
  item.sha256=digest(bytes);
  assert.equal(valid([review]),false);
}));
test("rejects non-PNG evidence even with matching digest",()=>fixture(({root,review,valid})=>{
  const item=review.screenshots[0],bytes=Buffer.from("not a screenshot");
  writeFileSync(join(root,item.path),bytes);
  item.sha256=digest(bytes);
  assert.equal(valid([review]),false);
}));
