import {afterEach,describe,expect,it,vi} from "vitest";
import {
  runBoundTemplatePhotoProduction,readBoundTemplatePhotoStatus,
  readBoundTemplatePhoto,type TemplatePhotoBucket,
} from "@/platform/photography/cloudflare-production.server";

const summitKey="school-template-previews/v3/summit/hero.jpg";
const requestId="765c6e0f-abcd-4fed-8abc-1234567890ab";
function jpeg4k(){
  const value=new Uint8Array(4096);
  value.set([255,216,255,192,0,17,8,8,112,15,0,3,1,17,0,2,17,0,3,17,0],0);
  return value;
}
function fakeR2(){
  const objects=new Map<string,Uint8Array>();
  const bucket:TemplatePhotoBucket={
    head:async key=>objects.has(key)?{size:objects.get(key)!.byteLength}:null,
    get:async key=>{
      const value=objects.get(key);
      if(!value)return null;
      return {
        body:new Response(new Uint8Array(value).buffer).body!,
        text:async()=>new TextDecoder().decode(value),
      };
    },
    put:async (key,value,options)=>{
      if(options?.onlyIf?.etagDoesNotMatch==="*"&&objects.has(key))return null;
      const bytes=typeof value==="string"?new TextEncoder().encode(value)
        :value instanceof ArrayBuffer?new Uint8Array(value)
        :new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
      objects.set(key,new Uint8Array(bytes));
      return {key};
    },
    list:async ({prefix,limit})=>({objects:[...objects.keys()]
      .filter(key=>key.startsWith(prefix)).slice(0,limit??1000).map(key=>({key}))}),
  };
  return {bucket,objects};
}

afterEach(()=>vi.unstubAllGlobals());

describe("scheduled template image generation to R2",()=>{
  it("submits exactly one Summit 4K hero, persists its asset URL, and serves the verified JPEG",async()=>{
    const {bucket,objects}=fakeR2();
    const calls:string[]=[];
    const media=jpeg4k();
    vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      calls.push(url);
      if(url==="https://queue.fal.run/fal-ai/nano-banana-2"&&init?.method==="POST"){
        const args=JSON.parse(String(init.body));
        expect(args.aspect_ratio).toBe("16:9");
        expect(args.resolution).toBe("4K");
        expect(args.output_format).toBe("jpeg");
        expect(args.prompt).toContain("Summit Preparatory");
        return Response.json({request_id:requestId});
      }
      if(url.endsWith(`/requests/${requestId}/status`))
        return Response.json({status:"COMPLETED"});
      if(url.endsWith(`/requests/${requestId}`))
        return Response.json({images:[{url:"https://y3b.fal.media/files/test/hero.jpg"}],
          description:"One fictional Summit campus photo"});
      if(url==="https://y3b.fal.media/files/test/hero.jpg")
        return new Response(new Uint8Array(media).buffer,{
          status:200,headers:{"Content-Type":"image/jpeg"},
        });
      throw Error(`Unexpected test network call: ${url}`);
    }));
    const env={
      CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",FAL_KEY:"test:key",
      TEMPLATE_PHOTO_BUCKET:bucket,
    };
    const first=await runBoundTemplatePhotoProduction(env);
    expect(first.submitted).toBe(1);
    expect(objects.has(summitKey)).toBe(false);
    const jobKey="school-template-production/pilot-summit-20261108/hero.json";
    expect(JSON.parse(new TextDecoder().decode(objects.get(jobKey))).requestId).toBe(requestId);
    const second=await runBoundTemplatePhotoProduction(env);
    expect(second.uploaded).toBe(1);
    expect(objects.get(summitKey)?.byteLength).toBe(4096);
    const job=JSON.parse(new TextDecoder().decode(objects.get(jobKey)));
    expect(job.status).toBe("completed");
    const status=await readBoundTemplatePhotoStatus(
      new Request("https://can-os.example/template-photo-status?template=summit"),env);
    expect(await status.json()).toMatchObject({
      template:"summit",generated:1,total:12,ready:["hero"],heroStatus:"completed",
    });
    const image=await readBoundTemplatePhoto(
      new Request("https://can-os.example/template-photo/summit/hero"),env);
    expect(image.status).toBe(200);
    expect(image.headers.get("Content-Type")).toBe("image/jpeg");
    const third=await runBoundTemplatePhotoProduction(env);
    expect(third.submitted).toBe(0);
    expect(calls.filter(url=>url==="https://queue.fal.run/fal-ai/nano-banana-2")).toHaveLength(1);
  });

  it("does not run any paid job when disabled",async()=>{
    const {bucket}=fakeR2();
    const fetchMock=vi.fn();
    vi.stubGlobal("fetch",fetchMock);
    expect((await runBoundTemplatePhotoProduction({
      TEMPLATE_PHOTO_BUCKET:bucket,CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"false",
    })).status).toBe("disabled");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
