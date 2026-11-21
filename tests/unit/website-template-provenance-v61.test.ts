import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { siteTemplateIds } from "@/domain/site-theme";
import { publicSitePagePaths } from "@/domain/public-site-paths";
import {
  composePublicSiteHome, siteTemplateCatalog, type PublicSiteHomeSections,
} from "@/domain/public-site-templates";
import {
  websiteChromeSources, websiteTemplatePageSources,
  websiteTemplateHomeSources, websiteTemplatePresentationNotes,
  websiteTemplatePageSourcesComplete,
} from "@/domain/website-template-source-map";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Website & Brand template source provenance",()=>{
  it("describes all seven exact published wireframes, not alternative templates",()=>{
    expect(siteTemplateIds).toHaveLength(7);
    expect(siteTemplateCatalog.map(x=>x.id)).toEqual([...siteTemplateIds]);
    expect(Object.keys(websiteTemplatePresentationNotes).sort()).toEqual([...siteTemplateIds].sort());
    for(const id of siteTemplateIds){
      const note=websiteTemplatePresentationNotes[id];
      expect(note.layout.length).toBeGreaterThan(45);
      expect(note.chrome.length).toBeGreaterThan(30);
      expect(note.hero.length).toBeGreaterThan(30);
    }
  });

  it("orders Home sections from the actual HTML composer for every template",()=>{
    const allKeys=websiteTemplateHomeSources("heritage").map(section=>section.key);
    expect(allKeys).toHaveLength(11);
    for(const id of siteTemplateIds){
      const sections=websiteTemplateHomeSources(id);
      expect(sections).toHaveLength(11);
      expect([...sections.map(section=>section.key)].sort()).toEqual([...allKeys].sort());
      const tokens=Object.fromEntries(allKeys.map(key=>[key,"__section_"+key+"__"]))
        as PublicSiteHomeSections;
      const actual=composePublicSiteHome(id,tokens);
      const positions=sections.map(section=>actual.indexOf(tokens[section.key as keyof PublicSiteHomeSections]));
      expect(positions.every(pos=>pos>=0)).toBe(true);
      expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    }
    // Community prioritizes Story; Modern puts academic learning first.
    const community=websiteTemplateHomeSources("community").map(x=>x.key);
    const modern=websiteTemplateHomeSources("modern").map(x=>x.key);
    expect(community.indexOf("story")).toBeLessThan(community.indexOf("academics"));
    expect(modern.indexOf("academics")).toBeLessThan(modern.indexOf("story"));
  });

  it("maps every supported interior page in all templates",()=>{
    expect(websiteTemplatePageSourcesComplete).toBe(true);
    for(const id of siteTemplateIds){
      for(const page of publicSitePagePaths){
        const sections=websiteTemplatePageSources(id,page);
        expect(sections.length,id+"/"+page).toBeGreaterThan(0);
        for(const section of sections){
          expect(section.title.length).toBeGreaterThan(3);
          expect(section.description.length).toBeGreaterThan(20);
          expect(section.appearsWhen.length).toBeGreaterThan(20);
          expect(section.elements.length).toBeGreaterThan(1);
          for(const entry of section.elements){
            expect(entry.element.length).toBeGreaterThan(3);
            expect(entry.source.length).toBeGreaterThan(5);
            expect(entry.details.length).toBeGreaterThan(25);
            expect(entry.editAt.length).toBeGreaterThan(5);
          }
        }
      }
    }
  });

  it("distinguishes saved identity, editable story, artwork, approved data and fixed copy",()=>{
    const hero=websiteTemplateHomeSources("heritage").find(item=>item.key==="hero")!;
    expect(hero.elements.some(item=>item.source.includes("heroHeadline")
      && item.editAt.includes("Your Content"))).toBe(true);
    expect(hero.elements.some(item=>item.source.includes("Brand")
      && item.details.includes("exact saved"))).toBe(true);
    expect(hero.elements.some(item=>item.kind==="site-media")).toBe(true);
    expect(hero.elements.some(item=>item.kind==="template-copy")).toBe(true);
    const vision=websiteTemplateHomeSources("classic").find(item=>item.key==="vision")!;
    expect(vision.elements.some(item=>item.source.includes("schoolVision"))).toBe(true);
    expect(vision.elements.some(item=>item.details.includes("fixed display heading"))).toBe(true);
    const classes=websiteTemplatePageSources("modern","/classes")[0]!;
    expect(classes.elements.some(item=>item.source.includes("Classes"))).toBe(true);
    expect(classes.elements.some(item=>item.kind==="computed")).toBe(true);
    expect(websiteChromeSources.some(item=>item.details.includes("Demo"))).toBe(true);
  });

  it("keeps wireframe selection free of sample content and makes source guidance available in Your Content",()=>{
    const gallery=read("src/components/launch-studio/WebsiteTemplateGallery.tsx");
    const editor=read("src/components/launch-studio/WebsiteSiteContentStep.tsx");
    const guide=read("src/components/launch-studio/WebsiteTemplateSourceGuide.tsx");
    const renderer=read("src/domain/public-site-html.ts");
    expect(gallery).not.toContain("WebsiteTemplateSourceGuide");
    expect(gallery).not.toContain("renderPublicSiteHtml");
    expect(gallery).not.toContain("<iframe");
    expect(editor).toContain('<WebsiteTemplateSourceGuide template={content.branding.templateId ?? "heritage"} page="/" />');
    for(const phrase of ["Data source:","Where it changes:","When shown:","Fixed template text"])
      expect(guide).toContain(phrase);
    expect(renderer).not.toContain("WebsiteTemplateSourceGuide");
    expect(renderer).not.toContain("websiteTemplateHomeSources");
    expect(renderer).not.toContain("website-template-source-map");
  });
});
