import {describe,expect,it,vi} from "vitest";
import {
  allowedTemplateVariantWidth,allowedTemplateCrop,templateResponsiveAttributes,
  templateResponsiveWidths,templateHeroPictureSources,
} from "@/domain/template-photo-responsive";
import {
  readBoundTemplatePhoto,type TemplatePhotoBucket,type TemplatePhotoImages,
} from "@/platform/photography/cloudflare-production.server";

describe("template preview responsive image delivery",()=>{
  it("offers bounded widths for hero, interior and mosaic without new images",()=>{
    expect(templateResponsiveWidths.hero).toEqual([640,960,1280,1920,2560,3840]);
    expect(allowedTemplateVariantWidth("hero","3840")).toBe(3840);
    expect(allowedTemplateVariantWidth("hero","480")).toBeUndefined();
    expect(allowedTemplateVariantWidth("program_01","480")).toBe(480);
    expect(allowedTemplateVariantWidth("portrait_01","1600")).toBe(1600);
    expect(allowedTemplateVariantWidth("portrait_01","3840")).toBeUndefined();
    expect(allowedTemplateVariantWidth("hero","640;delete")).toBeUndefined();
    expect(allowedTemplateVariantWidth("hero",null)).toBeNull();
  });

  it("only adds srcset to trusted private preview image paths when enabled",()=>{
    const trusted="/template-photo/summit/hero";
    const markup=templateResponsiveAttributes(trusted,"hero",true);
    expect(markup).toContain(`${trusted}?w=640 640w`);
    expect(markup).toContain(`${trusted}?w=3840 3840w`);
    expect(markup).toContain('sizes="100vw"');
    const versioned="/template-photo/summit/hero?v=20261109";
    const versionedSet=templateResponsiveAttributes(versioned,"hero",true);
    expect(versionedSet).toContain(`${versioned}&w=640 640w`);
    expect(versionedSet).toContain(`${versioned}&w=3840 3840w`);
    expect(versionedSet).not.toContain("?v=20261109?w=");
    expect(templateResponsiveAttributes(trusted,"hero",false)).toBe("");
    expect(templateResponsiveAttributes("/media/private-asset","hero",true)).toBe("");
    expect(templateResponsiveAttributes("javascript:alert(1)","hero",true)).toBe("");
    expect(templateResponsiveAttributes("https://example.com/photo","hero",true)).toBe("");
    expect(templateResponsiveAttributes("/template-photo/unknown/hero","hero",true)).toBe("");
  });

  it("uses mobile 4:5 and tablet 4:3 picture sources only for a trusted template hero",()=>{
    const src="/template-photo/heritage/hero?v=20261109";
    const sources=templateHeroPictureSources(src,true);
    expect(sources).toContain('media="(max-width: 699px)"');
    expect(sources).toContain('media="(max-width: 1100px)"');
    expect(sources).toContain(`${src}&c=mobile&w=640 640w`);
    expect(sources).toContain(`${src}&c=tablet&w=960 960w`);
    expect(sources).not.toContain("w=3840");
    expect(templateHeroPictureSources(src,false)).toBe("");
    expect(templateHeroPictureSources("/template-photo/heritage/story_01","true"===true)).toBe("");
    expect(allowedTemplateCrop("hero","mobile")).toBe("mobile");
    expect(allowedTemplateCrop("hero","tablet")).toBe("tablet");
    expect(allowedTemplateCrop("hero","portrait")).toBeUndefined();
    expect(allowedTemplateCrop("story_01","mobile")).toBeUndefined();
  });

  it("crops a mobile hero from private R2 to 4:5 WebP and rejects unsafe crop variants",async()=>{
    const r2=new Uint8Array([255,216,255,217]);
    const bucket:TemplatePhotoBucket={
      head:async()=>({size:r2.length}),
      list:async()=>({objects:[]}),
      get:async()=>({body:new Response(r2).body!,text:async()=>""}),
      put:async key=>({key}),
    };
    const transform=vi.fn((opts:{width:number;height?:number;fit?:string;gravity?:string})=>{
      expect(opts).toEqual({width:640,height:800,fit:"cover",gravity:"auto"});
      return {output:async()=>({response:()=>new Response(new Uint8Array([82,73,70,70]),{
        status:200,headers:{"Content-Type":"image/webp"},
      })})};
    });
    const images={input:()=>({transform})} as unknown as TemplatePhotoImages;
    const env={TEMPLATE_PHOTO_BUCKET:bucket,IMAGES:images};
    const result=await readBoundTemplatePhoto(new Request(
      "https://example.com/template-photo/heritage/hero?v=20261109&c=mobile&w=640"),env);
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toBe("image/webp");
    expect(transform).toHaveBeenCalledTimes(1);
    for(const invalid of [
      "?c=mobile&w=3840",
      "?c=tablet&w=640",
      "?c=mobile",
      "?c=foobar&w=640",
      "?c=mobile&w=9999",
    ]){
      const res=await readBoundTemplatePhoto(new Request(
        "https://example.com/template-photo/heritage/hero"+invalid),env);
      expect(res.status).toBe(404);
    }
    const unauthorized=await readBoundTemplatePhoto(new Request(
      "https://example.com/template-photo/heritage/story_01?c=mobile&w=640"),env);
    expect(unauthorized.status).toBe(404);
    expect(transform).toHaveBeenCalledTimes(1);
  });

  it("serves an optimized variant from native private R2 bytes, leaving the original unchanged",async()=>{
    const jpeg=new Uint8Array([255,216,255,217]);
    const bucket:TemplatePhotoBucket={
      head:async()=>({size:jpeg.length}),
      list:async()=>({objects:[]}),
      get:async key=>key==="school-template-previews/v3/summit/hero.jpg"?
        {body:new Response(jpeg).body!,text:async()=>""}:null,
      put:async key=>({key}),
    };
    const transform=vi.fn((options:{width:number})=>{
      expect(options.width).toBe(640);
      return {
        output:vi.fn(({format,quality}:{format:"image/webp";quality:number})=>{
          expect(format).toBe("image/webp");
          expect(quality).toBe(80);
          return Promise.resolve({response:()=>new Response(new Uint8Array([82,73,70,70]),{
            headers:{"Content-Type":"image/webp"},
          })});
        }),
      };
    });
    const images={
      input:vi.fn(()=>({transform})),
    } as unknown as TemplatePhotoImages;
    const env={TEMPLATE_PHOTO_BUCKET:bucket,IMAGES:images};
    const variant=await readBoundTemplatePhoto(new Request(
      "https://can-os.example/template-photo/summit/hero?w=640"),env);
    expect(variant.status).toBe(200);
    expect(variant.headers.get("Content-Type")).toBe("image/webp");
    expect(images.input).toHaveBeenCalledOnce();

    const original=await readBoundTemplatePhoto(new Request(
      "https://can-os.example/template-photo/summit/hero"),env);
    expect(original.headers.get("Content-Type")).toBe("image/jpeg");
    expect(images.input).toHaveBeenCalledOnce();

    const denied=await readBoundTemplatePhoto(new Request(
      "https://can-os.example/template-photo/summit/hero?w=9999"),env);
    expect(denied.status).toBe(404);
    expect(images.input).toHaveBeenCalledOnce();
  });
});
