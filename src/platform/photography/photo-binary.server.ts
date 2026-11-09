/**
 * Validate downloaded fal media from file bytes rather than URL suffix or an
 * untrusted Content-Type header. Output type remains available when uploading
 * to R2, so browsers never receive PNG bytes labelled as JPEG.
 */
import {jpegDimensions} from "./scheduled-production.server";

export type PhotoFileType = "image/jpeg"|"image/png"|"image/webp";
export type VerifiedPhoto={
  bytes:ArrayBuffer;
  width:number;
  height:number;
  contentType:PhotoFileType;
  extension:"jpg"|"png"|"webp";
};
function u32be(b:Uint8Array,p:number):number{
  return (b[p]! * 0x1000000)+(b[p+1]!<<16)+(b[p+2]!<<8)+b[p+3]!;
}
function starts(b:Uint8Array,p:number,value:string):boolean{
  if(p+value.length>b.length)return false;
  for(let i=0;i<value.length;i++)
    if(b[p+i]!==value.charCodeAt(i))return false;
  return true;
}
function imageMetadata(b:Uint8Array):
  {width:number;height:number;contentType:PhotoFileType;extension:"jpg"|"png"|"webp"}|null{
  if(b.length>=24&&b[0]===137&&starts(b,1,"PNG")&&
     b[4]===13&&b[5]===10&&b[6]===26&&b[7]===10&&starts(b,12,"IHDR")){
    const width=u32be(b,16),height=u32be(b,20);
    if(width&&height&&width<=16384&&height<=16384)
      return {width,height,contentType:"image/png",extension:"png"};
  }
  if(b[0]===255&&b[1]===216){
    const dim=jpegDimensions(b);
    if(dim&&dim.width<=16384&&dim.height<=16384)
      return {...dim,contentType:"image/jpeg",extension:"jpg"};
  }
  if(b.length>=30&&starts(b,0,"RIFF")&&starts(b,8,"WEBP")){
    let width=0,height=0;
    if(starts(b,12,"VP8X")){
      width=1+(b[24]!|(b[25]!<<8)|(b[26]!<<16));
      height=1+(b[27]!|(b[28]!<<8)|(b[29]!<<16));
    }else if(starts(b,12,"VP8 ")&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a){
      width=(b[26]!|(b[27]!<<8))&0x3fff;
      height=(b[28]!|(b[29]!<<8))&0x3fff;
    }else if(starts(b,12,"VP8L")&&b[20]===0x2f){
      width=1+(b[21]!|((b[22]!&0x3f)<<8));
      height=1+((b[22]!>>6)|(b[23]!<<2)|((b[24]!&0x0f)<<10));
    }
    if(width&&height&&width<=16384&&height<=16384)
      return {width,height,contentType:"image/webp",extension:"webp"};
  }
  return null;
}
export function verifyPhotoBytes(bytes:ArrayBuffer,minimum:{width:number;height:number}):VerifiedPhoto{
  const file=new Uint8Array(bytes);
  if(file.byteLength<4096||file.byteLength>25_000_000)
    throw Error("Generated file has invalid size");
  const metadata=imageMetadata(file);
  if(!metadata)throw Error("Generated media is not a supported JPEG, PNG or WebP");
  if(metadata.width<minimum.width||metadata.height<minimum.height)
    throw Error("Generated photo does not meet required resolution");
  return {bytes,...metadata};
}

/**
 * Original media must match its intended design placement. Pixel-size checks
 * alone would wrongly accept a 4096x4096 square for a 16:9 hero.
 * Image generators may round their output sizes by a few pixels.
 */
export function verifyPhotoAspectRatio(
  photo:Pick<VerifiedPhoto,"width"|"height">,
  expected:"16:9"|"3:2"|"4:3"|"4:5",
):void{
  const targets={"16:9":16/9,"3:2":3/2,"4:3":4/3,"4:5":4/5};
  const ratio=photo.width/photo.height,target=targets[expected];
  if(!Number.isFinite(ratio)||Math.abs(ratio-target)/target>0.04)
    throw Error("Generated photo does not match required aspect ratio");
}
