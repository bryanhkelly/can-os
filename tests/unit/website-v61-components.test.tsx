import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DisclosureSection } from "@/components/workspace/disclosure-section";
import { WebsiteCopyField } from "@/components/launch-studio/WebsiteCopyField";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";

describe("Website & Brand V6.1 shared controls",()=>{
  it("renders accessible, rectangular disclosure with independent default state",()=>{
    const collapsed=renderToStaticMarkup(
      <DisclosureSection title="Colors" description="Curated palette">
        <div>Picker</div>
      </DisclosureSection>);
    const expanded=renderToStaticMarkup(
      <DisclosureSection title="Typography" defaultOpen>
        <div>Fonts</div>
      </DisclosureSection>);
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain("Curated palette");
    expect(collapsed).toContain("hidden");
    expect(expanded).toContain('aria-expanded="true"');
    expect(expanded).not.toContain("rounded");
  });
  it("shows a source-attributed suggestion without overwriting the current field",()=>{
    const content=createSchoolWebsiteStarterContent("Demo Academy");
    const html=renderToStaticMarkup(<WebsiteCopyField
      field={{key:"welcomeMessage",label:"Welcome",help:"Purpose",multi:true}}
      content={content} disabled={false}
      candidate={{field:"welcomeMessage",text:"A future we hope to build.",
        reason:"Site Information values"}}
      onChange={()=>{throw new Error("Render must never apply a suggestion");}}
      onRestore={()=>{throw new Error("Render must never reset a field");}}/>);
    expect(html).toContain("A future we hope to build.");
    expect(html).toContain("Site Information values");
    expect(html).toContain("Apply suggestion");
    expect(html).toContain("Reset to original");
    expect(html).toContain(content.welcomeMessage);
  });
});
