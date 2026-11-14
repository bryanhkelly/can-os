import { describe, expect, it } from "vitest";
import {
  evaluateKnowledgeCheckResult, NONCREDIT_KEY_REF,
  openNoncreditAnswerKey, scoreNoncreditChoices, sealNoncreditAnswerKey,
} from "@/domain/noncredit-knowledge-check";

const key="8c".repeat(32);
const id="11110000-0000-4000-8000-000000000001";
const optionA="22220000-0000-4000-8000-000000000001";
const optionB="22220000-0000-4000-8000-000000000002";
const optionC="22220000-0000-4000-8000-000000000003";

describe("noncredit objective knowledge-check engine",()=>{
  it("uses authenticated ciphertext and never returns the correct answer to the learner",()=>{
    expect(NONCREDIT_KEY_REF).toContain("aes256gcm");
    const encrypted=sealNoncreditAnswerKey(key,id,[optionA]);
    expect(encrypted.toString("utf8")).not.toContain(optionA);
    expect(openNoncreditAnswerKey(key,id,encrypted)).toEqual([optionA]);
    expect(()=>openNoncreditAnswerKey("ff".repeat(32),id,encrypted)).toThrow();
    const swapped=Buffer.from(encrypted);
    swapped[swapped.length-1]^=1;
    expect(()=>openNoncreditAnswerKey(key,id,swapped)).toThrow();
    expect(()=>openNoncreditAnswerKey(key,"11110000-0000-4000-8000-000000000002",encrypted)).toThrow();
  });

  it("scores a fixed-choice question by exact published answer, not survey response",()=>{
    const common={responseKind:"single_select" as const,correctOptionIds:[optionB],
      availableOptionIds:[optionA,optionB,optionC],maxPoints:2};
    expect(scoreNoncreditChoices({...common,chosenOptionIds:[optionB]})).toBe(2);
    expect(scoreNoncreditChoices({...common,chosenOptionIds:[optionA]})).toBe(0);
    expect(()=>scoreNoncreditChoices({...common,chosenOptionIds:[optionB,optionC]})).toThrow();
    expect(()=>scoreNoncreditChoices({...common,chosenOptionIds:[optionB,optionB]})).toThrow();
    expect(()=>scoreNoncreditChoices({...common,chosenOptionIds:["invalid"]})).toThrow();
  });

  it("requires all correct selections in a multiple-choice question",()=>{
    const common={responseKind:"multi_select" as const,correctOptionIds:[optionA,optionC],
      availableOptionIds:[optionA,optionB,optionC],maxPoints:1};
    expect(scoreNoncreditChoices({...common,chosenOptionIds:[optionC,optionA]})).toBe(1);
    expect(scoreNoncreditChoices({...common,chosenOptionIds:[optionA]})).toBe(0);
    expect(scoreNoncreditChoices({...common,chosenOptionIds:[optionB,optionC]})).toBe(0);
  });

  it("returns knowledge-check pass/fail rather than academic credit or grades",()=>{
    expect(evaluateKnowledgeCheckResult(4,5,0.8)).toMatchObject({
      earned:4,possible:5,fraction:0.8,outcome:"pass",
    });
    expect(evaluateKnowledgeCheckResult(3,5,0.8).outcome).toBe("fail");
    expect(evaluateKnowledgeCheckResult(3,5,null).outcome).toBe("inconclusive");
    expect(()=>evaluateKnowledgeCheckResult(6,5,0.8)).toThrow();
    expect(()=>evaluateKnowledgeCheckResult(4,5,1.1)).toThrow();
  });
});
