import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isBlueprintLocalExperienceKind } from "@/domain/blueprint-configuration";
import { BlueprintLocalExperienceEditorV61, type LocalExperienceDraft } from "./BlueprintLocalExperienceEditorV61";

const categories = [{id:"component-1",key:"community_arts",kind:"experience"}];
const base = {
  categories, categoryId:"component-1", title:"Community art", summary:"Drawing together",
  experiences:[] as LocalExperienceDraft[], disabled:false,
  onCategoryChange:()=>{}, onTitleChange:()=>{}, onSummaryChange:()=>{},
  onAdd:()=>{}, onRemove:()=>{},
};

function addButton(html:string) {
  const index = html.indexOf("Add to my plan");
  return html.slice(html.lastIndexOf("<button",index),html.indexOf("</button>",index)+9);
}

describe("controlled V6.1 local experience proposal editor", () => {
  it("uses exactly the kinds permitted by canonical Blueprint validation", () => {
    for(const value of ["community","experience","club","activity"])
      expect(isBlueprintLocalExperienceKind(value)).toBe(true);
    for(const value of ["program_model","offering","academic","weekend"])
      expect(isBlueprintLocalExperienceKind(value)).toBe(false);
  });

  it("renders the selected published category without approving the proposed activity", () => {
    const html = renderToStaticMarkup(<BlueprintLocalExperienceEditorV61 {...base}/>);
    expect(html).toContain("community arts");
    expect(html).toContain("A proposal is not an approved activity.");
    expect(html).toContain("canonical-local-component");
    expect(html).toContain("Drawing together");
    expect(addButton(html)).not.toContain('disabled=""');
  });

  it("disables additions to a removed or unavailable category", () => {
    const html = renderToStaticMarkup(<BlueprintLocalExperienceEditorV61 {...base}
      categories={[]} />);
    expect(addButton(html)).toContain('disabled=""');
  });

  it("enforces the draft proposal cap and lock state in its view", () => {
    const experiences = Array.from({length:200},(_,index)=>({
      source:"proposed_local_experience" as const,
      componentId:"component-1",kind:"experience" as const,
      title:"Activity "+index,summary:"",configuration:{},
    })) as LocalExperienceDraft[];
    const html = renderToStaticMarkup(<BlueprintLocalExperienceEditorV61
      {...base} experiences={experiences} disabled />);
    expect(html).toContain('<fieldset');
    expect(html).toContain('disabled=""');
    expect(addButton(html)).toContain('disabled=""');
    expect(html).toContain("Activity 0");
    expect(html).toContain("Remove");
  });
});
