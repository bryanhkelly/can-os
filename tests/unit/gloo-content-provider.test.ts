import {afterEach,describe,expect,it,vi} from "vitest";
import {generateWithGloo,generateSitePackageWithGloo,testGlooConnection} from "@/modules/sites/gloo-content-provider.server";
import {buildSiteGenerationInput,siteGenerationTaskSchema} from "@/domain/site-content-generation";
import {projectSiteContentBriefV61} from "@/domain/site-content-brief-v61";
import {initialOutreachPlanV61} from "@/domain/marketing-package-v61";
import {input as packageInput,content as packageContent} from "../fixtures/site-content-package.fixture";
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

describe("Gloo persistent package transport",()=>{
  const envelope=(value:unknown,status="completed")=>new Response(JSON.stringify({status,model:"synthetic-model",id:"package-test",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(value)}]}]}));
  function configure(){vi.stubEnv("GLOO_API_KEY","synthetic-key");vi.stubEnv("GLOO_MODEL","synthetic-model");}
  it("requests the shared website and marketing contract exactly once",async()=>{
    configure();
    const sender=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>envelope(packageContent));
    const result=await generateSitePackageWithGloo(packageInput,sender);
    expect(sender).toHaveBeenCalledTimes(1);
    const [url,request]=sender.mock.calls[0]!;
    expect(url).toBe("https://platform.ai.gloo.com/ai/v2/guarded/responses");
    expect(request?.redirect).toBe("error");
    const body=JSON.parse(String(request?.body));
    expect(JSON.parse(body.input)).toEqual(packageInput);
    expect(body.max_output_tokens).toBe(12000);
    expect(result.content.website.heroHeadline).toBe(packageContent.website.heroHeadline);
    expect(result.content.marketing["site-announcement"]).toEqual(packageContent.marketing["site-announcement"]);
    expect(result.providerResponseId).toBe("package-test");
  });
  it("persists the configured model identifier when the provider omits its model metadata",async()=>{
    configure();
    const result=await generateSitePackageWithGloo(packageInput,async()=>new Response(JSON.stringify({
      status:"completed",id:"package-test",output:[{type:"message",content:[{type:"output_text",text:JSON.stringify(packageContent)}]}],
    })));
    expect(result.model).toBe("synthetic-model");
  });
  it("rejects incomplete, oversized and ungrounded packages",async()=>{
    configure();
    await expect(generateSitePackageWithGloo(packageInput,async()=>envelope(packageContent,"incomplete"))).rejects.toThrow(/incomplete/);
    await expect(generateSitePackageWithGloo(packageInput,async()=>envelope({...packageContent,websiteComposition:undefined}))).rejects.toThrow(/contract/);
    await expect(generateSitePackageWithGloo(packageInput,async()=>envelope({...packageContent,audiences:[{id:"unknown",description:"Unverified"}]}))).rejects.toThrow(/contract/);
    await expect(generateSitePackageWithGloo(packageInput,async()=>new Response("x".repeat(129000)))).rejects.toThrow(/invalid response/);
  });
});

describe("Gloo safe connection diagnostics",()=>{
 it("reports missing variables without sending a request",async()=>{
  vi.stubEnv("GLOO_API_KEY","");vi.stubEnv("GLOO_MODEL","");
  const send=vi.fn(async()=>new Response("unexpected"));
  expect(await testGlooConnection(send)).toMatchObject({ok:false,code:"gloo_missing_both",keyConfigured:false,modelConfigured:false});expect(send).not.toHaveBeenCalled();
 });
 it("records HTTP status without leaking response bodies or credentials",async()=>{
  vi.stubEnv("GLOO_API_KEY","private-key");vi.stubEnv("GLOO_MODEL","private-model");
  const result=await testGlooConnection(async()=>new Response("sensitive body",{status:401}));
  expect(result).toMatchObject({ok:false,code:"gloo_http_401",keyConfigured:true,modelConfigured:true});expect(JSON.stringify(result)).not.toMatch(/private-key|private-model|sensitive body/);
 });
 it("confirms a real response envelope",async()=>{
  vi.stubEnv("GLOO_API_KEY","key");vi.stubEnv("GLOO_MODEL","model");
  expect(await testGlooConnection(async()=>new Response(JSON.stringify({status:"completed",output:[{type:"message",content:[{type:"output_text",text:"OK"}]}]})))).toMatchObject({ok:true,code:"gloo_ok"});
 });
});
