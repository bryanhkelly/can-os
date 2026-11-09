#!/usr/bin/env node
/** Read-only remote delivery acceptance. No fal.ai calls or R2 mutations. */
import fs from "node:fs/promises";
const origin="https://can-os.bryanhkelly.workers.dev";
const templates=["heritage","community","modern","bright-futures","summit","classic","campus"];
const roles=["hero","story_01","story_02","program_01","program_02","program_03",
  "community_01","community_02","admissions","portrait_01","portrait_02","portrait_03"];
const results=[],errors=[];
const fail=(what)=>{errors.push(what);console.error("FAIL",what);};
function sizeOf(bytes,mime){
  const b=new Uint8Array(bytes),str=(i,n)=>String.fromCharCode(...b.slice(i,i+n));
  if(str(0,4)==="RIFF" && str(8,4)==="WEBP"){
    const tag=str(12,4);
    if(tag==="VP8X"&&b.length>=30)
      return {width:1+b[24]+(b[25]<<8)+(b[26]<<16),
        height:1+b[27]+(b[28]<<8)+(b[29]<<16)};
    if(tag==="VP8 "&&b.length>=30&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a)
      return {width:(b[26]|b[27]<<8)&0x3fff,height:(b[28]|b[29]<<8)&0x3fff};
    if(tag==="VP8L"&&b.length>=25&&b[20]===0x2f)
      return {width:1+b[21]+((b[22]&0x3f)<<8),
        height:1+((b[22]&0xc0)>>6)+(b[23]<<2)+((b[24]&0x0f)<<10)};
  }
  if(b[0]===0x89&&str(1,3)==="PNG"&&b.length>=24){
    const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
    return {width:view.getUint32(16),height:view.getUint32(20)};
  }
  if(b[0]===0xff&&b[1]===0xd8){
    let p=2;
    while(p+9<b.length){
      if(b[p]!==0xff){p++;continue;}
      let marker=b[++p];p++;
      while(marker===0xff && p<b.length)marker=b[p++];
      if(marker===0xd9||marker===0xda)break;
      if(marker===0xd8 || (marker>=0xd0&&marker<=0xd7))continue;
      if(p+2>b.length)break;
      const n=(b[p]<<8)+b[p+1];
      if(n<2||p+n>b.length)break;
      if((marker>=0xc0&&marker<=0xcf)&&![0xc4,0xc8,0xcc].includes(marker))
        return {width:(b[p+5]<<8)+b[p+6],height:(b[p+3]<<8)+b[p+4]};
      p+=n;
    }
  }
  throw Error("Cannot decode actual image dimensions ("+mime+")");
}
async function retrieve(path,readBytes=false){
  const response=await fetch(origin+path,{redirect:"error",
    signal:AbortSignal.timeout(25000)});
  if(response.status!==200){
    const detail=(await response.text()).slice(0,220).replace(/[\r\n]/g," ");
    throw Error(path+" returned HTTP "+response.status+" "+detail);
  }
  const mime=response.headers.get("content-type")||"";
  if(!/^image\/(jpeg|png|webp)/.test(mime))
    throw Error(path+" did not return an image ("+mime+")");
  if(!readBytes){await response.body?.cancel();return {mime};}
  const data=await response.arrayBuffer();
  if(data.byteLength<4096)throw Error(path+" returned too few bytes");
  return {mime,bytes:data.byteLength,...sizeOf(data,mime)};
}
for(const template of templates){
  const statusURL=`/template-photo-status?template=${template}`;
  try {
    const raw=await fetch(origin+statusURL,{redirect:"error",
      signal:AbortSignal.timeout(15000)});
    if(!raw.ok)throw Error("Status API HTTP "+raw.status);
    const status=await raw.json();
    if(status.generated!==12||!Array.isArray(status.ready)||status.ready.length!==12)
      throw Error(`R2 library incomplete: ${status.generated}/12`);
    const item={template,master:null,desktop:null,tablet:null,mobile:null,roles:0};
    for(const role of roles){
      await retrieve(`/template-photo/${template}/${role}?v=20261109`);
      item.roles++;
    }
    item.master=await retrieve(`/template-photo/${template}/hero?v=20261109`,true);
    if(item.master.width<3840||item.master.height<2160)
      throw Error("Hero master below 4K minimum: "+JSON.stringify(item.master));
    const checks=[
      ["desktop",`/template-photo/${template}/hero?v=20261109&w=640`,640,360],
      ["tablet",`/template-photo/${template}/hero?v=20261109&c=tablet&w=960`,960,720],
      ["mobile",`/template-photo/${template}/hero?v=20261109&c=mobile&w=640`,640,800],
    ];
    for(const [name,path,w,h] of checks){
      const transformed=await retrieve(path,true);
      item[name]=transformed;
      if(!transformed.mime.includes("image/webp")||
        transformed.width!==w||transformed.height!==h)
        throw Error(name+" requested "+w+"x"+h+" but got "+
          JSON.stringify(transformed));
    }
    results.push(item);
    console.log("PASS",template,"12/12 role URLs, 4K original, responsive",
      checks.map(x=>x[0]).join("/"));
  }catch(error){fail(template+": "+(error instanceof Error?error.message:"unknown"));}
}
const report={checkedAt:new Date().toISOString(),results,errors,
  success:results.length===7&&errors.length===0};
await fs.mkdir("artifacts/photo-acceptance",{recursive:true});
await fs.writeFile("artifacts/photo-acceptance/result.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({success:report.success,
  templatesPassing:results.length,masterRolesVerified:results.reduce((a,x)=>a+x.roles,0),
  errors},null,2));
if(!report.success)process.exitCode=1;
