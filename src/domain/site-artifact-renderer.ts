import type { ResolvedSiteBrand } from "./site-brand";
import type { MarketingFormat, MarketingPackageContent } from "./marketing-package-v61";

export type RenderedMarketingAsset={
  format:MarketingFormat;templateId:string;templateVersion:1;
  mimeType:string;extension:string;body:string;plainText?:string;
};
const escape=(value:string)=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function wrap(text:string,limit:number,max:number):string[]{
  const words=text.replace(/\s+/g," ").trim().split(" ");
  const out:string[]=[];let line="";
  for(const word of words){
    if(!word)continue;
    if((line+" "+word).trim().length>limit){
      if(line)out.push(line);
      line=word.slice(0,limit);
    }else line=(line+" "+word).trim();
    if(out.length>=max)break;
  }
  if(line&&out.length<max)out.push(line);
  if(out.length===max&&out.at(-1)!.length>limit-2)
    out[max-1]=out[max-1]!.slice(0,limit-2)+"…";
  return out;
}
const proposed="Proposed learning community · Not accepting enrollment";
function svgText(lines:readonly string[],x:number,y:number,gap:number,size:number,color:string){
  return lines.map((line,index)=>`<text x="${x}" y="${y+index*gap}" font-size="${size}"
    fill="${color}">${escape(line)}</text>`).join("");
}
const printable=(format:"flyer"|"handout"|"social",brand:ResolvedSiteBrand,content:MarketingPackageContent,websiteUrl:string|null)=>{
  const social=format==="social";const handout=format==="handout";
  const width=social?1080:816,height=social?1080:1056,padding=social?78:70;
  const ink=brand.theme.ink,canvas=brand.theme.canvas,accent=brand.theme.accent;
  const headline=wrap(content.headline,social?26:33,social?4:3);
  const message=wrap(content.message,social?39:56,social?11:14);
  const headerY=social?185:160;
  const messageY=headerY+headline.length*(social?75:60)+70;
  const captionY=height-124;
  const url=websiteUrl?wrap(websiteUrl,65,1)[0]:null;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(brand.displayName)} announcement" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${canvas}"/>
  <rect x="0" y="0" width="${width}" height="18" fill="${ink}"/>
  <rect x="${padding}" y="76" width="55" height="55" fill="${ink}"/>
  <text x="${padding+27}" y="113" fill="${canvas}" text-anchor="middle" font-size="26"
    font-family="Georgia,serif">${escape(brand.displayName.slice(0,1).toUpperCase())}</text>
  <g font-family="Arial,Helvetica,sans-serif">
    <text x="${padding+78}" y="111" font-size="26" font-weight="bold" fill="${ink}">${escape(brand.displayName.slice(0,43))}</text>
    ${svgText(headline,padding,headerY+50,social?75:60,social?65:51,ink)}
    <rect x="${padding}" y="${messageY-38}" width="95" height="8" fill="${accent}"/>
    ${svgText(message,padding,messageY+32,social?36:35,social?30:24,ink)}
    <rect x="${padding}" y="${captionY-30}" width="${width-2*padding}" height="1" fill="${brand.theme.secondary}"/>
    <text x="${padding}" y="${captionY}" font-size="21" fill="${ink}">${escape(proposed)}</text>
    ${url?`<text x="${padding}" y="${captionY+38}" font-size="18" fill="${ink}">${escape(url)}</text>`:""}
  </g></svg>`;
  return {format,templateId:"can-site-"+format,templateVersion:1 as const,
    mimeType:"image/svg+xml",extension:"svg",body:svg};
};
export function renderSiteMarketingArtifact(input:{
  format:MarketingFormat;brand:ResolvedSiteBrand;content:MarketingPackageContent;websiteUrl:string|null;
  qrSvg?:string;
}):RenderedMarketingAsset{
  const {format,brand,content,websiteUrl}=input;
  if(format==="flyer"||format==="handout"||format==="social")
    return printable(format,brand,content,websiteUrl);
  if(format==="qr-card"){
    if(!input.qrSvg||!websiteUrl)throw new Error("QR cards require a reviewed, durable public Site destination.");
    return {format,templateId:"can-site-qr",templateVersion:1,mimeType:"image/svg+xml",
      extension:"svg",body:input.qrSvg};
  }
  const ink=brand.theme.ink,canvas=brand.theme.canvas;
  const head=`<html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"></head>`;
  const action=websiteUrl
    ?`<p style="margin:20px 0"><a href="${escape(websiteUrl)}" style="background:${ink};
      color:${canvas};display:inline-block;padding:14px 22px;text-decoration:none">
      ${escape(content.callToAction||"Learn more")}</a></p>`:"";
  const html=`<!doctype html>${head}<body style="margin:0;background:${canvas};
    color:${ink};font-family:Arial,Helvetica,sans-serif">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
    <tr><td style="padding:28px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="max-width:600px;margin:auto;border-collapse:collapse;background:#ffffff">
    <tr><td style="padding:28px 32px;border-top:8px solid ${ink}">
      <p style="font-size:18px;font-weight:bold">${escape(brand.displayName)}</p>
      <h1 style="font-family:Georgia,serif;font-size:32px;line-height:1.2">${escape(content.headline)}</h1>
      <p style="font-size:16px;line-height:1.6;white-space:pre-wrap">${escape(content.message)}</p>
      ${action}
      <p style="font-size:13px;color:#334155">${escape(proposed)}</p>
    </td></tr></table></td></tr></table></body></html>`;
  return {format:"email",templateId:"can-site-email",templateVersion:1,
    mimeType:"text/html",extension:"html",body:html,
    plainText:`${brand.displayName}\n\n${content.headline}\n\n${content.message}\n\n${proposed}\n${websiteUrl??""}`};
}
