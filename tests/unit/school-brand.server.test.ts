import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSchoolBrand } from "@/modules/sites/school-brand.server";
import { resolveSiteTheme } from "@/domain/site-theme";

const state=vi.hoisted(()=>({
  rows:[] as unknown[],read:vi.fn(),
}));
vi.mock("@/db/client",()=>{
  const chain={from:()=>chain,leftJoin:()=>chain,where:()=>chain,limit:async()=>state.rows};
  return {db:{select:()=>chain}};
});
vi.mock("@/modules/sites/site-brand.functions",()=>({
  readSavedBrandVersion:state.read,
}));
const record=(published:boolean,versionId:string|null="v3")=>({
  name:"Valor School",slug:"valorschool",status:published?"published":"draft",
  publishedBrandVersionId:versionId,
});
const resolved=(extra:Record<string,unknown>={})=>({
  resolved:{displayName:"Valor Community",theme:resolveSiteTheme("heritage"),
    logo:null,hero:null,...extra},
});
beforeEach(()=>{
  state.rows=[record(true)];
  state.read.mockReset();
  state.read.mockResolvedValue(resolved());
});
describe("canonical saved and pinned published Site Brands",()=>{
  it("uses the exact published Brand, not a website-owned identity",async()=>{
    const result=await readSchoolBrand("site-id");
    expect(result).toMatchObject({name:"Valor Community",theme:{ink:"#162b45"}});
    expect(state.read).toHaveBeenCalledWith("site-id","v3");
    expect(result?.websiteUrl).toContain("valorschool");
  });
  it("uses current saved Brand before official website publication",async()=>{
    state.rows=[record(false)];
    const result=await readSchoolBrand("site-id");
    expect(result?.websiteUrl).toBeNull();
    expect(result?.theme.ink).toBe("#162b45");
    expect(state.read).toHaveBeenCalledWith("site-id",undefined);
  });
  it("requires pinned Brand for published Sites rather than silently falling forward",async()=>{
    state.rows=[record(true,null)];
    await expect(readSchoolBrand("site-id")).rejects.toThrow(/pinned Brand/);
  });
  it("rejects withdrawn public imagery while retaining text identity",async()=>{
    state.read.mockResolvedValue(resolved({logo:{
      id:"logo",dataUrl:"data:image/png;base64,AAAA",altText:"Logo",
      rightsConfirmed:true,revokedAt:"2026-11-19",childImageConsent:"no_identifiable_children",
    }}));
    expect((await readSchoolBrand("site-id"))?.logo).toBeNull();
  });
  it("does not fabricate a Brand for an unknown Site",async()=>{
    state.rows=[];
    expect(await readSchoolBrand("missing")).toBeNull();
    expect(state.read).not.toHaveBeenCalled();
  });
});
