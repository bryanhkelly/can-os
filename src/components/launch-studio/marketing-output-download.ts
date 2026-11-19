/** Browser-only downloads from an already authorized, immutable artifact output. */
export type DownloadableMarketingOutput = {
  content:string;mimeType:string;fileName:string;plainText?:string|null;
};

function saveBlob(file:Blob,fileName:string){
  const url=URL.createObjectURL(file);
  const link=document.createElement("a");
  try{
    link.href=url;link.download=fileName;link.style.display="none";
    document.body.append(link);link.click();link.remove();
  }finally{window.setTimeout(()=>URL.revokeObjectURL(url),1500);}
}

export function downloadOriginalMarketingOutput(output:DownloadableMarketingOutput):void{
  saveBlob(new Blob([output.content],{type:output.mimeType}),output.fileName);
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
    saveBlob(blob,output.fileName.replace(/\.svg$/i,".png"));
  }finally{URL.revokeObjectURL(svgUrl);}
}
