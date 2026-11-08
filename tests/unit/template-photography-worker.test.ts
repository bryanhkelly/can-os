import {describe,expect,it} from "vitest";
import {jpegDimensions} from "@/platform/photography/scheduled-production.server";
import {templatePhotographyRoles} from "@/domain/template-photography-production";
import {siteTemplateIds} from "@/domain/site-theme";

describe("4K template photography import checks",()=>{
  it("requires a well-formed JPEG with an actual SOF marker",()=>{
    expect(jpegDimensions(new Uint8Array([137,80,78,71]))).toBeNull();
    expect(jpegDimensions(new Uint8Array([255,216,255,217]))).toBeNull();
    // JPEG SOF0 header with height=2160 and width=3840.
    const jpeg=new Uint8Array([
      0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x08,0x70,0x0f,0x00,
      0x03,0x01,0x11,0x00,0x02,0x11,0x00,0x03,0x11,0x00,
    ]);
    expect(jpegDimensions(jpeg)).toEqual({width:3840,height:2160});
    expect(jpegDimensions(jpeg.subarray(0,10))).toBeNull();
  });
  it("defines exactly seven distinct hero jobs within the 84-image library",()=>{
    expect(siteTemplateIds.length).toBe(7);
    expect(templatePhotographyRoles.length).toBe(12);
    expect(siteTemplateIds.length*templatePhotographyRoles.length).toBe(84);
    expect(templatePhotographyRoles[0]).toBe("hero");
  });
});
