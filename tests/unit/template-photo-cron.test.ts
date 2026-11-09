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
  const contentTypes=new Map<string,string>();
  const bucket:TemplatePhotoBucket={
    head:async key=>objects.has(key)?{
      size:objects.get(key)!.byteLength,
      httpMetadata:{contentType:contentTypes.get(key)},
    }:null,
    get:async key=>{
      const value=objects.get(key);
      if(!value)return null;
      return {
        body:new Response(new Uint8Array(value).buffer).body!,
        text:async()=>new TextDecoder().decode(value),
        httpMetadata:{contentType:contentTypes.get(key)},
      };
    },
    put:async (key,value,options)=>{
      if(options?.onlyIf?.etagDoesNotMatch==="*"&&objects.has(key))return null;
      const bytes=typeof value==="string"?new TextEncoder().encode(value)
        :value instanceof ArrayBuffer?new Uint8Array(value)
        :value instanceof ReadableStream?
          new Uint8Array(await new Response(value).arrayBuffer())
          :new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
      objects.set(key,new Uint8Array(bytes));
      if(options?.httpMetadata?.contentType)
        contentTypes.set(key,options.httpMetadata.contentType);
      return {key};
    },
    list:async ({prefix,limit})=>({objects:[...objects.keys()]
      .filter(key=>key.startsWith(prefix)).slice(0,limit??1000).map(key=>({key}))}),
  };
  return {bucket,objects,contentTypes};
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
        return Response.json({
          request_id:requestId,
          response_url:`https://queue.fal.run/fal-ai/nano-banana-2/requests/${requestId}`,
          status_url:`https://queue.fal.run/fal-ai/nano-banana-2/requests/${requestId}/status`,
        });
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
      CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_BULK:"false",FAL_KEY:"test:key",
      TEMPLATE_PHOTO_BUCKET:bucket,
    };
    const first=await runBoundTemplatePhotoProduction(env);
    expect(first.submitted).toBe(1);
    expect(objects.has(summitKey)).toBe(false);
    const jobKey="school-template-production/pilot-summit-20261109/hero.json";
    const storedJob=JSON.parse(new TextDecoder().decode(objects.get(jobKey)));
    expect(storedJob.requestId).toBe(requestId);
    expect(storedJob.resultUrl).toBe(
      `https://queue.fal.run/fal-ai/nano-banana-2/requests/${requestId}`,
    );
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
    expect(calls.filter(url=>url.endsWith(`/requests/${requestId}`)).length).toBeGreaterThan(0);

  });

  it("recovers an already-paid Summit result into R2 without submitting any new request",async()=>{
    const {bucket,objects}=fakeR2();
    const key="school-template-production/pilot-summit-20261109/hero.json";
    const bytes=new TextEncoder().encode(JSON.stringify({
      status:"rejected",requestId,updatedAt:"2026-11-08T22:15:00.000Z",
      reason:"result-url:Provider connection failed",importAttempts:8,
    }));
    objects.set(key,bytes);
    // Keep unrelated Community recovery out of this focused test.
    objects.set("school-template-previews/v3/community/hero.jpg",jpeg4k());
    const called:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      called.push(url);
      if(init?.method==="POST")throw Error("Unexpected paid image generation");
      if(url.endsWith(`/requests/${requestId}`))
        return Response.json({images:[{url:"https://y3b.fal.media/files/test/hero.jpg"}]});
      if(url==="https://y3b.fal.media/files/test/hero.jpg")
        return new Response(new Uint8Array(jpeg4k()).buffer,{status:200});
      throw Error("Unexpected GET "+url);
    }));
    const env={
      CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",
      FAL_KEY:"test:key",TEMPLATE_PHOTO_BUCKET:bucket,
    };
    const completed=await runBoundTemplatePhotoProduction(env);
    expect(completed.submitted).toBe(0);
    expect(completed.uploaded).toBe(1);
    expect(objects.get(summitKey)?.byteLength).toBe(4096);
    const saved=JSON.parse(new TextDecoder().decode(objects.get(key)));
    expect(saved.status).toBe("completed");
    const result=await readBoundTemplatePhotoStatus(
      new Request("https://can-os.example/template-photo-status?template=summit"),env);
    expect(await result.json()).toMatchObject({
      template:"summit",generated:1,ready:["hero"],heroStatus:"completed",
    });
    expect(called.some(url=>url==="https://queue.fal.run/fal-ai/nano-banana-2")).toBe(false);
  });

  it("imports an older paid Summit job even when the newer pilot record is rejected",async()=>{
    const {bucket,objects}=fakeR2();
    const older="school-template-production/v1/summit/hero.json";
    const pilot="school-template-production/pilot-summit-20261109/hero.json";
    const encode=(data:unknown)=>new TextEncoder().encode(JSON.stringify(data));
    objects.set(older,encode({status:"submitted",requestId,
      updatedAt:"2026-11-08T23:00:00.000Z"}));
    objects.set(pilot,encode({status:"rejected",
      reason:"Invalid Authorization header",updatedAt:"2026-11-08T23:02:00.000Z"}));
    objects.set("school-template-previews/v3/community/hero.jpg",jpeg4k());
    const called:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);
      called.push(url);
      if(init?.method==="POST")throw Error("Unexpected new paid fal request");
      if(url.endsWith(`/requests/${requestId}`))
        return Response.json({images:[{url:"https://y3b.fal.media/files/test/hero.jpg"}]});
      if(url==="https://y3b.fal.media/files/test/hero.jpg")
        return new Response(new Uint8Array(jpeg4k()).buffer,{status:200});
      throw Error("Unexpected GET "+url);
    }));
    const env={CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",FAL_KEY:"test:key",
      TEMPLATE_PHOTO_BUCKET:bucket};
    expect((await runBoundTemplatePhotoProduction(env)).uploaded).toBe(1);
    expect(objects.has(summitKey)).toBe(true);
    const stat=await readBoundTemplatePhotoStatus(
      new Request("https://can-os.example/template-photo-status?template=summit"),env);
    expect(await stat.json()).toMatchObject({generated:1,
      heroStatus:"completed",newSubmissionsEnabled:false});
    expect(called.filter(url=>url==="https://queue.fal.run/fal-ai/nano-banana-2")).toHaveLength(0);
  });

  it("never generates an image when the new paid-submission switch is off",async()=>{
    const {bucket,objects}=fakeR2();
    objects.set("school-template-previews/v3/community/hero.jpg",jpeg4k());
    const fetchMock=vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      expect(init?.method).not.toBe("POST");
      expect(String(input)).toContain("api.fal.ai/v1/models/requests/by-endpoint");
      return Response.json({items:[],has_more:false,next_cursor:null});
    });
    vi.stubGlobal("fetch",fetchMock);
    const result=await runBoundTemplatePhotoProduction({
      CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",
      TEMPLATE_PHOTO_BUCKET:bucket,FAL_KEY:"test:key",
    });
    expect(result.submitted).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discovers two already-paid Summit images in fal history and transfers the valid JPEG to R2",async()=>{
    const {bucket,objects}=fakeR2();
    // The Community request is already known, so it can be ingested via its
    // original request ID while request history discovers paid Summit assets.
    const communityId="01a1bd6d-371f-7153-8d96-484fa643cac1";
    const summitOld="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const summitGood="11111111-2222-4333-8444-555555555555";
    const media=jpeg4k();
    const invalid=new Uint8Array(media);
    invalid[9]=0x04;invalid[10]=0x00; // 1024 pixels instead of 3840
    const calls:Array<{url:string;method:string}>=[];
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input),method=init?.method??"GET";
      calls.push({url,method});
      if(method==="POST")throw Error("Paid generation must be blocked");
      if(url.endsWith(`/requests/${communityId}`))
        return Response.json({images:[{url:"https://y3b.fal.media/files/community.jpg"}]});
      if(url==="https://y3b.fal.media/files/community.jpg")
        return new Response(new Uint8Array(media).buffer,{status:200});
      if(url.startsWith("https://api.fal.ai/v1/models/requests/by-endpoint?")){
        const query=new URL(url).searchParams;
        expect(query.get("endpoint_id")).toBe("fal-ai/nano-banana-2");
        expect(query.get("expand")).toBe("payloads");
        return Response.json({items:[
          {endpoint_id:"fal-ai/nano-banana-2",status_code:200,request_id:summitOld,
            json_input:{prompt:"Summit Preparatory: first hero"},
            json_output:{images:[{url:"https://y3b.fal.media/files/bad.jpg"}]}},
          {endpoint_id:"fal-ai/nano-banana-2",status_code:200,request_id:summitGood,
            json_input:{prompt:"Summit Preparatory: second hero"},
            json_output:{images:[{url:"https://y3b.fal.media/files/good.jpg"}]}},
        ],has_more:false,next_cursor:null});
      }
      if(url==="https://y3b.fal.media/files/bad.jpg")
        return new Response(new Uint8Array(invalid).buffer,{status:200});
      if(url==="https://y3b.fal.media/files/good.jpg")
        return new Response(new Uint8Array(media).buffer,{status:200});
      throw Error("Unexpected recovery URL: "+url);
    }));
    const env={CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",
      FAL_KEY:"test:key",TEMPLATE_PHOTO_BUCKET:bucket};
    const result=await runBoundTemplatePhotoProduction(env);
    expect(result.submitted).toBe(0);
    expect(result.uploaded).toBeGreaterThanOrEqual(1);
    expect(objects.get(summitKey)?.byteLength).toBe(4096);
    const diag=JSON.parse(new TextDecoder().decode(objects.get(
      "school-template-production/v1/fal-history-recovery.json")));
    expect(diag.state).toBe("imported");
    expect(diag.matching).toBe(2);
    expect(diag.uploaded).toBe(1);
    expect(diag.archived).toBe(1);
    const status=await readBoundTemplatePhotoStatus(
      new Request("https://can-os.example/template-photo-status?template=summit"),env);
    expect(await status.json()).toMatchObject({
      generated:1,ready:["hero"],heroStatus:"completed",
      newSubmissionsEnabled:false,
      uploadRecovery:{state:"imported",uploaded:1},
    });
    expect(calls.some(x=>x.method==="POST")).toBe(false);
  });

  it("archives both paid Summit alternatives but selects just one canonical website hero",async()=>{
    const {bucket,objects}=fakeR2();
    const oldId="aaaaaaaa-1111-4222-8333-444444444444";
    const newId="bbbbbbbb-1111-4222-8333-444444444444";
    objects.set("school-template-previews/v3/community/hero.jpg",jpeg4k());
    const calls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);calls.push(url);
      expect(init?.method).not.toBe("POST");
      if(url.startsWith("https://api.fal.ai/v1/models/requests/by-endpoint?"))
        return Response.json({items:[oldId,newId].map((request_id,index)=>({
          endpoint_id:"fal-ai/nano-banana-2",status_code:200,request_id,
          json_input:{prompt:"Summit Preparatory: completed and paid"},
          json_output:{images:[{url:`https://y3b.fal.media/files/${index}.jpg`}]},
        }))});
      if(url.startsWith("https://y3b.fal.media/files/"))
        return new Response(new Uint8Array(jpeg4k()).buffer,{status:200});
      throw Error("Unexpected external request: "+url);
    }));
    const env={CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",FAL_KEY:"test:key",
      TEMPLATE_PHOTO_BUCKET:bucket};
    const result=await runBoundTemplatePhotoProduction(env);
    expect(result.uploaded).toBe(1);
    expect(result.submitted).toBe(0);
    expect(objects.has(summitKey)).toBe(true);
    for(const id of [oldId,newId])
      expect(objects.has(`school-template-previews/v3/_archive/summit/${id}.jpg`)).toBe(true);
    const diag=JSON.parse(new TextDecoder().decode(objects.get(
      "school-template-production/v1/fal-history-recovery.json")));
    expect(diag.archived).toBe(2);
    expect(diag.matching).toBe(2);
    expect(calls.some(url=>url==="https://queue.fal.run/fal-ai/nano-banana-2")).toBe(false);
  });

  it("fetches a completed PNG as an ArrayBuffer, writes it through native R2, and serves image/png",async()=>{
    const {bucket,objects,contentTypes}=fakeR2();
    const sourceKey="school-template-production/pilot-summit-20261109/hero.json";
    const req="c0ffee00-1111-4222-8333-444444444444";
    objects.set(sourceKey,new TextEncoder().encode(JSON.stringify({
      status:"submitted",requestId:req,
      updatedAt:"2026-11-08T22:00:00.000Z",
    })));
    objects.set("school-template-previews/v3/community/hero.jpg",jpeg4k());
    const png=new Uint8Array(4096);
    png.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82],0);
    png.set([0,0,16,0,0,0,9,0],16);
    const calls:string[]=[];
    vi.stubGlobal("fetch",vi.fn(async (input:RequestInfo|URL,init?:RequestInit)=>{
      const url=String(input);calls.push(url);
      expect(init?.method).not.toBe("POST");
      if(url.endsWith(`/requests/${req}`))
        return Response.json({images:[{url:"https://y3b.fal.media/files/test/image.png"}]});
      if(url==="https://y3b.fal.media/files/test/image.png")
        return new Response(png.buffer,{status:200,headers:{"Content-Type":"image/png"}});
      if(url.startsWith("https://api.fal.ai/v1/models/requests/by-endpoint?"))
        return Response.json({items:[],has_more:false,next_cursor:null});
      throw Error("Unexpected request: "+url);
    }));
    const env={CAN_TEMPLATE_PHOTOGRAPHY_GENERATE:"true",
      CAN_TEMPLATE_PHOTOGRAPHY_SUBMIT:"false",FAL_KEY:"test:key",
      TEMPLATE_PHOTO_BUCKET:bucket};
    const output=await runBoundTemplatePhotoProduction(env);
    expect(output.submitted).toBe(0);
    expect(output.uploaded).toBe(1);
    expect(objects.get(summitKey)?.byteLength).toBe(4096);
    expect(contentTypes.get(summitKey)).toBe("image/png");
    const response=await readBoundTemplatePhoto(
      new Request("https://can-os.test/template-photo/summit/hero"),env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    const info=await readBoundTemplatePhotoStatus(
      new Request("https://can-os.test/template-photo-status?template=summit"),env);
    expect(await info.json()).toMatchObject({generated:1,r2WriteVerified:true,
      newSubmissionsEnabled:false,heroStatus:"completed"});
    expect(calls.filter(x=>x==="https://queue.fal.run/fal-ai/nano-banana-2")).toHaveLength(0);
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
