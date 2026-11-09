import {describe,it,expect} from "vitest";
import type {TemplatePhotoBucket} from "@/platform/photography/cloudflare-production.server";
import {
  advanceTemplatePhotoReset,isOwnedTemplatePhotoResetKey,
  PHOTO_RESET_ARCHIVE_PREFIX,PHOTO_RESET_STATE_KEY,
  readTemplatePhotoResetState,
} from "@/platform/photography/r2-photo-reset.server";

function memoryBucket(){
  const data=new Map<string,Uint8Array>();
  const bucket:TemplatePhotoBucket={
    head:async key=>data.has(key)?{size:data.get(key)!.byteLength,
      httpMetadata:{contentType:"image/jpeg"}}:null,
    get:async key=>{
      const bytes=data.get(key);
      if(!bytes)return null;
      return {body:new Response(new Uint8Array(bytes)).body!,
        text:async()=>new TextDecoder().decode(bytes),
        httpMetadata:{contentType:"image/jpeg"}};
    },
    put:async (key,body,options)=>{
      if(options?.onlyIf?.etagDoesNotMatch==="*" && data.has(key))return null;
      const bytes=typeof body==="string"?new TextEncoder().encode(body)
        :body instanceof ArrayBuffer?new Uint8Array(body)
        :body instanceof ReadableStream?
          new Uint8Array(await new Response(body).arrayBuffer())
          :new Uint8Array(body.buffer,body.byteOffset,body.byteLength);
      data.set(key,new Uint8Array(bytes));
      return {key};
    },
    delete:async key=>{data.delete(key);},
    list:async ({prefix,limit})=>({objects:[...data.keys()]
      .filter(k=>k.startsWith(prefix)).sort().slice(0,limit??1000)
      .map(key=>({key}))}),
  };
  return {bucket,data};
}

describe("one-time template R2 photo cleanup",()=>{
  it("only allows current generated photo and exact legacy-job namespaces",()=>{
    for(const key of [
      "school-template-previews/v3/community/hero.jpg",
      "school-template-previews/v3/summit/story_01.jpg",
      "school-template-previews/v3/_archive/summit/11111111-2222-4333-8444-555555555555.jpg",
      "school-template-production/v1/summit/hero.json",
      "school-template-production/v1/r2-write-verified.json",
      "school-template-production/pilot-summit-20261108/hero.json",
    ])expect(isOwnedTemplatePhotoResetKey(key)).toBe(true);
    for(const key of [
      "school-template-previews/v2/community/hero.jpg",
      "school-template-previews/v4/community/hero.jpg",
      "school-template-previews/v3/other-project.jpg",
      "school-template-previews/v3/community/../../private.jpg",
      "school-template-production/v2/summit/hero.json",
      "media/school-upload/hero.jpg",
      "school-owned-media/public-site/hero.jpg",
    ])expect(isOwnedTemplatePhotoResetKey(key)).toBe(false);
  });

  it("archives and verifies before deleting, completes over multiple ticks, and never repeats",async()=>{
    const {bucket,data}=memoryBucket();
    const records=[
      "school-template-previews/v3/community/hero.jpg",
      "school-template-previews/v3/summit/hero.jpg",
      "school-template-previews/v3/heritage/story_01.jpg",
      "school-template-previews/v3/modern/program_03.jpg",
      "school-template-production/v1/community/hero.json",
      "school-template-production/v1/cursor.json",
      "school-template-production/pilot-summit-20261108/hero.json",
    ];
    for(const [i,key] of records.entries())data.set(key,
      new Uint8Array([255,216,i,217,31,41,51,61]));
    data.set("school-template-previews/v2/community/hero.jpg",
      new Uint8Array([10,20]));
    data.set("media/approved/school.jpg",new Uint8Array([10,20,30]));
    let step=await advanceTemplatePhotoReset(bucket);
    expect(step.phase).toBe("running");
    expect(step.removed).toBe(4);
    expect(step.copied).toBe(4);
    expect(data.has(records[0]!)).toBe(false);
    while(step.phase!=="completed"){
      step=await advanceTemplatePhotoReset(bucket);
      expect(step.removed).toBeLessThanOrEqual(records.length);
    }
    expect(step.removed).toBe(records.length);
    for(const key of records){
      expect(data.has(key)).toBe(false);
      expect(data.get(PHOTO_RESET_ARCHIVE_PREFIX+key))
        .toEqual(new Uint8Array([255,216,records.indexOf(key),217,31,41,51,61]));
    }
    expect(data.has("school-template-previews/v2/community/hero.jpg")).toBe(true);
    expect(data.has("media/approved/school.jpg")).toBe(true);
    const state=await readTemplatePhotoResetState(bucket);
    expect(state?.phase).toBe("completed");
    expect(data.has(PHOTO_RESET_STATE_KEY)).toBe(true);
    const idempotent=await advanceTemplatePhotoReset(bucket);
    expect(idempotent.removed).toBe(records.length);
    expect(idempotent.phase).toBe("completed");
  });

  it("blocks unknown files rather than deleting private or future assets",async()=>{
    const {bucket,data}=memoryBucket();
    const unknown="school-template-previews/v3/community/mystery.json";
    data.set(unknown,new Uint8Array([1,2,3,4]));
    const state=await advanceTemplatePhotoReset(bucket);
    expect(state.phase).toBe("blocked");
    expect(state.reason).toMatch(/allowlist/);
    expect(data.has(unknown)).toBe(true);
  });

  it("does not delete the original if archive verification fails",async()=>{
    const {bucket,data}=memoryBucket();
    const key="school-template-previews/v3/community/hero.jpg";
    data.set(key,new Uint8Array([1,2,3,4,5]));
    const badBucket={...bucket,
      put:async (k:string,body:string|ArrayBuffer|ArrayBufferView|ReadableStream,
        options?:{onlyIf?:{etagDoesNotMatch:string};
          httpMetadata?:{contentType:string}})=>{
        const result=await bucket.put(k,body,options);
        if(k.startsWith(PHOTO_RESET_ARCHIVE_PREFIX))
          data.set(k,new Uint8Array([1,2]));
        return result;
      },
    };
    const status=await advanceTemplatePhotoReset(badBucket);
    expect(status.phase).toBe("blocked");
    expect(status.reason).toMatch(/archive size verification failed/);
    expect(data.has(key)).toBe(true);
  });
});
