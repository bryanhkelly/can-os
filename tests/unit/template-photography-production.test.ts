import {describe,expect,it} from "vitest";
import {schoolPhotographyBatch,schoolPhotographyBrief,templatePhotographyRoles}
  from "@/domain/template-photography-production";
import {siteTemplateIds} from "@/domain/site-theme";

describe("school photography production briefs",()=>{
  it("defines exactly twelve unique roles and two non-overlapping batches of six for all seven templates",()=>{
    expect(siteTemplateIds).toHaveLength(7);
    expect(templatePhotographyRoles).toHaveLength(12);
    expect(new Set(templatePhotographyRoles).size).toBe(12);
    for(const template of siteTemplateIds){
      const first=schoolPhotographyBatch(template,1);
      const second=schoolPhotographyBatch(template,2);
      expect(first).toHaveLength(6);
      expect(second).toHaveLength(6);
      const complete=[...first,...second];
      expect(new Set(complete.map(job=>job.filename)).size).toBe(12);
      expect(first.every(job=>job.batch===1)).toBe(true);
      expect(second.every(job=>job.batch===2)).toBe(true);
      expect(complete.every(job=>job.prompt.includes("No words"))).toBe(true);
    }
  });
  it("keeps exact role dimensions and a full-width 16:9 hero",()=>{
    const hero=schoolPhotographyBrief("community","hero");
    expect(hero.minimum).toEqual({width:3840,height:2160});
    expect(hero.aspect_ratio).toBe("16:9");
    expect(hero.filename).toBe("community/hero.jpg");
    expect(schoolPhotographyBrief("modern","story_01").aspect_ratio).toBe("3:2");
    expect(schoolPhotographyBrief("bright-futures","program_01").aspect_ratio).toBe("4:3");
    expect(schoolPhotographyBrief("campus","portrait_02").aspect_ratio).toBe("4:5");
  });
  it("preserves distinct artistic directions per template",()=>{
    const prompts=siteTemplateIds.map(template=>schoolPhotographyBrief(template,"hero").prompt);
    expect(new Set(prompts).size).toBe(7);
    expect(schoolPhotographyBrief("classic","hero").prompt).toContain("Socratic");
    expect(schoolPhotographyBrief("campus","hero").prompt).toContain("photojournalism");
  });
});
