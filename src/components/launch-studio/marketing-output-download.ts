import { downloadBlob } from "@/lib/download";

/** Browser-only downloads from an already authorized, immutable artifact output. */
export type DownloadableMarketingOutput = {
  content:string;mimeType:string;fileName:string;plainText?:string|null;
};

export function downloadOriginalMarketingOutput(output:DownloadableMarketingOutput):void{
  downloadBlob(new Blob([output.content],{type:output.mimeType}),output.fileName);
}

/** PNG derivative is made only from the frozen SVG's original bytes, not the current Brand. */
export async function downloadMarketingPng(output:DownloadableMarketingOutput):Promise<void>{
  if(output.mimeType!=="image/svg+xml")throw new Error("Only vector artwork can be downloaded as PNG.");
  const svgUrl=URL.createObjectURL(new Blob([output.content],{type:"image/svg+xml;charset=utf-8"}));
  const image=new Image();
  try{
    image.src=svgUrl;
    await image.decode();
    const width=image.naturalWidth||1080;
    const height=image.naturalHeight||1080;
    if(width>4096||height>4096||width<1||height<1)
      throw new Error("The artwork dimensions are not suitable for PNG export.");
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");
    if(!context)throw new Error("This browser cannot convert the artwork to PNG.");
    context.drawImage(image,0,0,width,height);
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(
      result=>result?resolve(result):reject(new Error("Unable to export PNG. Check image permissions.")),
      "image/png",
    ));
    downloadBlob(blob,output.fileName.replace(/\.svg$/i,".png"));
  }finally{URL.revokeObjectURL(svgUrl);}
}


/** Deterministic, uncompressed ZIP. Uses only immutable, server-verified bytes.
 * No second asset store, browser dependency, or re-rendering from current Brand.
 */
export type MarketingPackageArchiveFile={name:string;body:string};
function crc32(bytes:Uint8Array):number{
  let crc=0xffffffff;
  for(const byte of bytes){
    crc^=byte;
    for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function concatBytes(parts:readonly Uint8Array[]):Uint8Array{
  const result=new Uint8Array(parts.reduce((sum,p)=>sum+p.length,0));
  let position=0;
  for(const part of parts){result.set(part,position);position+=part.length;}
  return result;
}
export function buildMarketingPackageZip(files:readonly MarketingPackageArchiveFile[]):Uint8Array{
  if(!files.length || files.length>20)throw new Error("Package archive needs 1–20 files.");
  const encoder=new TextEncoder();
  const locals:Uint8Array[]=[];
  const directory:Uint8Array[]=[];
  let offset=0;
  const names=new Set<string>();
  for(const file of files){
    if(!file.name||file.name.includes("/")||file.name.includes("\\")||
      file.name==="."||file.name===".."||names.has(file.name))
      throw new Error("Invalid or duplicate Package archive filename.");
    names.add(file.name);
    const name=encoder.encode(file.name);
    const body=encoder.encode(file.body);
    const crc=crc32(body);
    const local=new Uint8Array(30+name.length);
    const localView=new DataView(local.buffer);
    localView.setUint32(0,0x04034b50,true);
    localView.setUint16(4,20,true);
    localView.setUint16(6,0x0800,true);
    localView.setUint16(8,0,true);
    localView.setUint16(10,0,true);
    localView.setUint16(12,33,true);
    localView.setUint32(14,crc,true);
    localView.setUint32(18,body.length,true);
    localView.setUint32(22,body.length,true);
    localView.setUint16(26,name.length,true);
    local.set(name,30);
    locals.push(local,body);
    const central=new Uint8Array(46+name.length);
    const centralView=new DataView(central.buffer);
    centralView.setUint32(0,0x02014b50,true);
    centralView.setUint16(4,20,true);
    centralView.setUint16(6,20,true);
    centralView.setUint16(8,0x0800,true);
    centralView.setUint16(10,0,true);
    centralView.setUint16(12,0,true);
    centralView.setUint16(14,33,true);
    centralView.setUint32(16,crc,true);
    centralView.setUint32(20,body.length,true);
    centralView.setUint32(24,body.length,true);
    centralView.setUint16(28,name.length,true);
    centralView.setUint32(42,offset,true);
    central.set(name,46);
    directory.push(central);
    offset+=local.length+body.length;
  }
  const directoryLength=directory.reduce((n,p)=>n+p.length,0);
  const end=new Uint8Array(22);
  const view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);
  view.setUint16(8,files.length,true);
  view.setUint16(10,files.length,true);
  view.setUint32(12,directoryLength,true);
  view.setUint32(16,offset,true);
  return concatBytes([...locals,...directory,end]);
}
export function downloadMarketingPackageZip(
  title:string,releaseNumber:number,files:readonly MarketingPackageArchiveFile[],
):void{
  const zip=buildMarketingPackageZip(files);
  const name=title.replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,64)||
    "marketing-package";
  downloadBlob(new Blob([zip.buffer as ArrayBuffer],{type:"application/zip"}),
    name+"-v"+releaseNumber+".zip");
}
