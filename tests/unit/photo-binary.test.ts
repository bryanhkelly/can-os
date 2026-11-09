import {describe,it,expect} from "vitest";
import {verifyPhotoBytes} from "@/platform/photography/photo-binary.server";

const minimum={width:3840,height:2160};
function jpeg(){
  const b=new Uint8Array(4096);
  b.set([255,216,255,192,0,17,8,8,112,15,0,3,1,17,0,2,17,0,3,17,0],0);
  return b.buffer;
}
function png(){
  const b=new Uint8Array(4096);
  b.set([137,80,78,71,13,10,26,10],0);
  b.set([0,0,0,13,73,72,68,82],8);
  // width=4096, height=2304; big endian
  b.set([0,0,16,0,0,0,9,0],16);
  return b.buffer;
}
function webp(){
  const b=new Uint8Array(4096);
  b.set([82,73,70,70,0,16,0,0,87,69,66,80,86,80,56,88,10,0,0,0],0);
  // VP8X width-1=4095, height-1=2303, both 24-bit little endian
  b.set([255,15,0,255,8,0],24);
  return b.buffer;
}
describe("fal image download binary validation",()=>{
  it("keeps JPEGs as JPEGs",()=>{
    const photo=verifyPhotoBytes(jpeg(),minimum);
    expect(photo).toMatchObject({contentType:"image/jpeg",extension:"jpg",
      width:3840,height:2160});
  });
  it("accepts fal PNG output instead of permanently rejecting paid generation",()=>{
    const photo=verifyPhotoBytes(png(),minimum);
    expect(photo).toMatchObject({contentType:"image/png",extension:"png",
      width:4096,height:2304});
  });
  it("accepts fal WebP output and preserves its browser content type",()=>{
    const photo=verifyPhotoBytes(webp(),minimum);
    expect(photo).toMatchObject({contentType:"image/webp",extension:"webp",
      width:4096,height:2304});
  });
  it("rejects non-images and too-small originals",()=>{
    const bad=new Uint8Array(4096); bad.fill(1);
    expect(()=>verifyPhotoBytes(bad.buffer,minimum)).toThrow(/supported JPEG/);
    const small=new Uint8Array(png());small.set([0,0,4,0,0,0,4,0],16);
    expect(()=>verifyPhotoBytes(small.buffer,minimum)).toThrow(/required resolution/);
  });
});
