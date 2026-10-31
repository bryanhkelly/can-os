import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({actor:{grantSiteId:"site"},preview:vi.fn(),publish:vi.fn()}));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler:(callback:unknown)=>callback})}));
vi.mock("@tanstack/react-start/server",()=>({getRequest:()=>new Request("https://app.example.test"),setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/command-context.server",()=>({getCommandContext:async()=>state.actor}));
vi.mock("@/modules/sites/site-website-preview.server",()=>({getPartnerWebsitePreview:state.preview}));
vi.mock("@/modules/sites/site-local-content.server",()=>({publishPartnerLocalContent:state.publish}));
import {getPartnerWebsitePreviewView,publishChurchWebsiteContent,restoreChurchWebsiteContent} from "../../src/modules/sites/site-website-preview.functions";
beforeEach(()=>{vi.clearAllMocks();state.actor={grantSiteId:"site"};});
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
  await expect(publishChurchWebsiteContent({data:{siteId:"other",expectedRevision:0,content:{} as any}})).rejects.toThrow("intended church website Site");
  expect(state.publish).not.toHaveBeenCalled();
 });
 it("denies restoring a revision to a different Site",async()=>{
  await expect(restoreChurchWebsiteContent({data:{siteId:"other",expectedRevision:2,restoreRevision:1}})).rejects.toThrow("intended church website Site");
  expect(state.publish).not.toHaveBeenCalled();
 });
});
