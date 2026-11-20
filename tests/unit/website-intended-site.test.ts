import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({actor:{grantSiteId:"site"},preview:vi.fn(),publish:vi.fn(),brand:vi.fn(),transaction:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler:(callback:unknown)=>callback})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://app.example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/modules/sites/site-website-preview.server",()=>({getPartnerWebsitePreview:state.preview}));
vi.mock("@/db/client",()=>({db:{transaction:state.transaction}}));
vi.mock("@/modules/sites/site-brand.functions",()=>({
  assetInputSchema:{nullable:()=>({parse:(v:unknown)=>v})},
}));
vi.mock("@/modules/sites/site-brand.server",()=>({
  saveSiteBrandVersionWithinTransaction:state.brand,
}));
vi.mock("@/modules/sites/site-local-content.server",()=>({
  publishPartnerLocalContent:state.publish,
  publishPartnerLocalContentWithinTransaction:state.publish,
}));
import {getPartnerWebsitePreviewView,saveSiteWebsiteAndBrand,restoreChurchWebsiteContent} from "../../src/modules/sites/site-website-preview.functions";
beforeEach(()=>{
  vi.clearAllMocks();state.actor={grantSiteId:"site"};
  state.transaction.mockImplementation(async(callback:(tx:object)=>unknown)=>callback({}));
  state.publish.mockResolvedValue({status:"draft",revision:1});
  state.brand.mockResolvedValue({brandVersionId:"version-1",revision:1,configuration:{}});
});
describe("website handoff retains the intended Site",()=>{
 it("previews only the requested current editor Site",async()=>{
  await getPartnerWebsitePreviewView({data:{siteId:"site"}});
  expect(state.preview).toHaveBeenCalledWith(state.actor);
 });
 it("denies a different current editor Site before reading content",async()=>{
  await expect(getPartnerWebsitePreviewView({data:{siteId:"other"}})).rejects.toThrow("intended church website Site");
  expect(state.preview).not.toHaveBeenCalled();
 });
 it("denies a stale form save after switching to another Site",async()=>{
  await expect(saveSiteWebsiteAndBrand({data:{siteId:"other",operation:"draft",expectedRevision:0,expectedBrandVersionId:null,brand:{} as any,content:{} as any}})).rejects.toThrow("intended church website Site");
  expect(state.publish).not.toHaveBeenCalled();
 });
 it("runs Brand and website copy writes in a single transaction",async()=>{
  const result=await saveSiteWebsiteAndBrand({data:{
    siteId:"site",operation:"draft",expectedRevision:0,
    expectedBrandVersionId:null,brand:{} as any,
    content:{branding:{logoImage:null,heroImage:null}} as any,
  }});
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.publish).toHaveBeenCalledTimes(1);
  expect(state.brand).toHaveBeenCalledTimes(1);
  expect(state.publish.mock.invocationCallOrder[0])
    .toBeLessThan(state.brand.mock.invocationCallOrder[0]);
  expect(result).toMatchObject({website:{revision:1},brand:{brandVersionId:"version-1"}});
 });
 it("rejects a website conflict before attempting to write a Brand",async()=>{
  state.publish.mockRejectedValueOnce(new Error("website conflict"));
  await expect(saveSiteWebsiteAndBrand({data:{
    siteId:"site",operation:"draft",expectedRevision:0,
    expectedBrandVersionId:null,brand:{} as any,
    content:{branding:{logoImage:null,heroImage:null}} as any,
  }})).rejects.toThrow("website conflict");
  expect(state.brand).not.toHaveBeenCalled();
 });
 it("propagates a simultaneous Brand-edit conflict within the same transaction",async()=>{
  state.brand.mockRejectedValueOnce(new Error("This Site Brand changed. Reload"));
  await expect(saveSiteWebsiteAndBrand({data:{
    siteId:"site",operation:"draft",expectedRevision:0,
    expectedBrandVersionId:null,brand:{} as any,
    content:{branding:{logoImage:null,heroImage:null}} as any,
  }})).rejects.toThrow("This Site Brand changed");
  expect(state.transaction).toHaveBeenCalledTimes(1);
  expect(state.publish).toHaveBeenCalledTimes(1);
  expect(state.brand).toHaveBeenCalledTimes(1);
 });
 it("denies restoring a revision to a different Site",async()=>{
  await expect(restoreChurchWebsiteContent({data:{siteId:"other",expectedRevision:2,restoreRevision:1}})).rejects.toThrow("intended church website Site");
  expect(state.publish).not.toHaveBeenCalled();
 });
});
