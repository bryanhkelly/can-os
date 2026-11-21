import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BlueprintComponentPicker } from "./BlueprintComponentPicker";
import { BlueprintReferencesPicker } from "./BlueprintReferencesPicker";

type Component=Parameters<typeof BlueprintComponentPicker>[0]["components"][number];
type Reference=Parameters<typeof BlueprintReferencesPicker>[0]["catalog"][number];

const components=[{
  id:"required-1",key:"instruction_delivery",kind:"program_model",
  requirementMode:"required",description:"Published educational plan",
  requiresIndependentReview:true,
},{
  id:"optional-1",key:"community_experience",kind:"experience",
  requirementMode:"optional",description:"Site proposal",
  requiresIndependentReview:false,
}] as unknown as Component[];
const refs=[{
  versionId:"reference-1",kind:"program_model",
  title:"Published guide",summary:"Curated reference",
},{
  versionId:"reference-2",kind:"experience",
  title:"Experiential guide",summary:"Available only for experiences",
}] as unknown as Reference[];

describe("governed Blueprint pickers",()=>{
  it("renders mandatory components with independent verification boundaries",()=>{
    const html=renderToStaticMarkup(<BlueprintComponentPicker
      components={components} selected={["required-1"]} disabled={false} onToggle={()=>{}}/>);
    expect(html).toContain("instruction delivery");
    expect(html).toContain("required");
    expect(html).toContain("This part requires a separate review before use");
    expect(html).toContain("disabled");
  });
  it("limits reference choices to the selected component kind",()=>{
    const html=renderToStaticMarkup(<BlueprintReferencesPicker enabled
      components={components} selected={["required-1"]}
      catalog={refs} selectedReferences={{"required-1":["reference-1"]}}
      disabled={false} onToggle={()=>{}}/>);
    expect(html).toContain("Published guide");
    expect(html).not.toContain("Experiential guide");
    expect(html).toContain("available resources");
  });
  it("cannot present a curated reference chooser when references are disabled",()=>{
    const html=renderToStaticMarkup(<BlueprintReferencesPicker
      enabled={false} components={components} selected={["required-1"]}
      catalog={refs} selectedReferences={{}} disabled={false} onToggle={()=>{}}/>);
    expect(html).toBe("");
  });
});
