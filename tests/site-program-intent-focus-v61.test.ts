import { describe, expect, it } from "vitest";
import { emptySiteProgramsAudiencesV61 } from "../src/domain/site-launch-preferences";
import { chooseStartingIdeaV61, selectedStartingIdeaV61 } from "../src/domain/site-program-intent-focus-v61";

describe("Establish has one starting idea across Programs and other learning interests",()=>{
  const draft={...emptySiteProgramsAudiencesV61(),
    programCodes:["can.program.ai_digital_skills"],
    interestIds:["summer" as const,"adult" as const]};
  it("selects a published Program without adopting a Solution",()=>{
    const updated=chooseStartingIdeaV61(draft,"program:can.program.ai_digital_skills");
    expect(updated.startingProgramCode).toBe("can.program.ai_digital_skills");
    expect(updated.startingFocus).toBeNull();
    expect(selectedStartingIdeaV61(updated)).toBe("program:can.program.ai_digital_skills");
    expect(updated).not.toHaveProperty("solutionId");
  });
  it("selects a broad idea when no published Program has been selected",()=>{
    const updated=chooseStartingIdeaV61(draft,"interest:summer");
    expect(updated.startingFocus).toBe("summer");
    expect(updated.startingProgramCode).toBeNull();
    expect(selectedStartingIdeaV61(updated)).toBe("interest:summer");
  });
  it("clears the previous priority without clearing planned Programs",()=>{
    const chosen=chooseStartingIdeaV61(draft,"program:can.program.ai_digital_skills");
    const reset=chooseStartingIdeaV61(chosen,"");
    expect(reset.startingProgramCode).toBeNull();
    expect(reset.startingFocus).toBeNull();
    expect(reset.programCodes).toEqual(draft.programCodes);
    expect(reset.interestIds).toEqual(draft.interestIds);
  });
  it("rejects forged unselected Program/interest priority values",()=>{
    expect(()=>chooseStartingIdeaV61(draft,"program:other")).toThrow();
    expect(()=>chooseStartingIdeaV61(draft,"interest:grades-9-12")).toThrow();
    expect(()=>chooseStartingIdeaV61(draft,"solution:anything")).toThrow();
  });
  it("prefers a saved canonical Program when legacy data holds two priorities",()=>{
    expect(selectedStartingIdeaV61({...draft,startingFocus:"summer",
      startingProgramCode:"can.program.ai_digital_skills"})).toBe("program:can.program.ai_digital_skills");
  });
});
