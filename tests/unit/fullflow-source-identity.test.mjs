import { describe, expect, it } from "vitest";
import { assertFullFlowCheckout } from "../../scripts/fullflow-source-identity.mjs";
const sha="b".repeat(40);
describe("FullFlow browser checkout provenance before fixture writes",()=>{
  it.each(["main","FullFlow"])("accepts the exact GitHub workflow SHA on %s",branch=>{
    expect(assertFullFlowCheckout({sourceSha:sha,githubSha:sha,githubRefName:branch,githubRefType:"branch",localBranch:null})).toBe(sha);
  });
  it.each(["main","FullFlow"])("accepts a local %s checkout",branch=>{
    expect(assertFullFlowCheckout({sourceSha:sha,localBranch:branch})).toBe(sha);
  });
  it("refuses other branches, mismatched SHA, tags and missing identity",()=>{
    for(const input of [
      {sourceSha:sha,githubSha:"a".repeat(40),githubRefName:"main",githubRefType:"branch"},
      {sourceSha:sha,githubSha:sha,githubRefName:"feature/example",githubRefType:"branch"},
      {sourceSha:sha,githubSha:sha,githubRefName:"main",githubRefType:"tag"},
      {sourceSha:sha,githubRefName:"main",githubRefType:"branch"},
      {sourceSha:sha,githubSha:sha,githubRefName:"main"},
      {sourceSha:sha,localBranch:"feature/example"},
      {sourceSha:sha,localBranch:null},
      {sourceSha:"not-a-sha",githubRefName:"FullFlow"},
    ]) expect(()=>assertFullFlowCheckout(input)).toThrow(/refused|requires/);
  });
});
