import { describe, expect, it } from "vitest";
import { assertFullFlowCheckout } from "../../scripts/fullflow-source-identity.mjs";
const sha="b".repeat(40);
describe("FullFlow browser checkout provenance before fixture writes",()=>{
  it("accepts the exact GitHub workflow SHA on FullFlow",()=>{
    expect(assertFullFlowCheckout({sourceSha:sha,githubSha:sha,githubRefName:"FullFlow",localBranch:null})).toBe(sha);
  });
  it("accepts local FullFlow checkout and refuses main, detached or missing identity",()=>{
    expect(assertFullFlowCheckout({sourceSha:sha,localBranch:"FullFlow"})).toBe(sha);
    for(const input of [
      {sourceSha:sha,githubSha:"a".repeat(40),githubRefName:"FullFlow"},
      {sourceSha:sha,githubSha:sha,githubRefName:"main"},
      {sourceSha:sha,localBranch:"main"},
      {sourceSha:sha,localBranch:null},
      {sourceSha:"not-a-sha",githubRefName:"FullFlow"},
    ]) expect(()=>assertFullFlowCheckout(input)).toThrow(/refused|requires/);
  });
});
