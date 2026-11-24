import {afterEach,describe,expect,it,vi} from "vitest";
import {generateWithGloo} from "@/modules/sites/gloo-content-provider.server";
import {buildSiteGenerationInput,siteGenerationTaskSchema} from "@/domain/site-content-generation";
import {projectSiteContentBriefV61} from "@/domain/site-content-brief-v61";
import {initialOutreachPlanV61} from "@/domain/marketing-package-v61";
const input=buildSiteGenerationInput(projectSiteContentBriefV61({siteId:"123e4567-e89b-42d3-a456-426614174000",siteName:"Learning center",siteRevision:"2026-11-21T18:00:00.000Z",metadata:{},websiteContent:{contentReuseConsent:"granted"}}),siteGenerationTaskSchema.parse({target:"outreach",options:{},plan:initialOutreachPlanV61()}));
const output={schemaVersion:1,target:"outreach",website:null,outreach:{headline:"Explore learning",message:"Share your ideas for our planned learning community.",callToAction:"Learn more"},reviewNotes:[]};
afterEach(()=>vi.unstubAllEnvs());
describe("Gloo server provider adapter",()=>{
  it("uses a fixed guarded endpoint and validates the response",async()=>{
    vi.stubEnv("GLOO_API_KEY","synthetic-key");vi.stubEnv("GLOO_MODEL","synthetic-model");
    const sender=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({status:"completed",model:"synthetic-model",id:"response-test",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(output)}]}]})));
    const result=await generateWithGloo(input,sender);
    expect(sender).toHaveBeenCalledWith("https://platform.ai.gloo.com/ai/v2/guarded/responses",expect.objectContaining({method:"POST",redirect:"error"}));
    expect(result.content.outreach?.headline).toBe("Explore learning");
  });
  it("fails closed when the provider is unavailable or returns invalid JSON",async()=>{
    vi.stubEnv("GLOO_API_KEY","synthetic-key");vi.stubEnv("GLOO_MODEL","synthetic-model");
    await expect(generateWithGloo(input,async()=>new Response("denied",{status:403}))).rejects.toThrow();
    await expect(generateWithGloo(input,async()=>new Response(JSON.stringify({output:[{type:"message",content:[{type:"output_text",text:"not JSON"}]}]})))).rejects.toThrow();
    vi.stubEnv("GLOO_API_KEY","");
    await expect(generateWithGloo(input,async()=>{throw new Error("must not call");})).rejects.toThrow(/not configured/);
  });
});
