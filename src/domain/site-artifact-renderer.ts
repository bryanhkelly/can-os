import type { ResolvedSiteBrand } from "./site-brand";
import type { MarketingFormat, MarketingPackageContent } from "./marketing-package-v61";

export type RenderedMarketingAsset={
  format:MarketingFormat;templateId:string;templateVersion:number;
  mimeType:string;extension:string;body:string;plainText?:string;
};
const escape=(value:string)=>String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;")
  .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
function wrap(text:string,limit:number,max:number):string[]{
  const words=text.replace(/\s+/g," ").trim().split(" ");
  const out:string[]=[];let line="";let consumed=0;
  for(const word of words){
    if(!word)continue;
    if((line+" "+word).trim().length>limit){
      if(line)out.push(line);
      line=word.slice(0,limit);
    }else line=(line+" "+word).trim();
    consumed++;
    if(out.length>=max)break;
  }
  if(line&&out.length<max)out.push(line);
  if(out.length===max && (consumed<words.length || (out.at(-1)?.length??0)>limit-2))
    out[max-1]=out[max-1]!.slice(0,limit-2).trimEnd()+"…";
  return out;
}
const proposed="Proposed learning community · Not accepting enrollment";
function svgText(lines:readonly string[],x:number,y:number,gap:number,size:number,color:string){
  return lines.map((line,index)=>`<text x="${x}" y="${y+index*gap}" font-size="${size}"
    fill="${color}">${escape(line)}</text>`).join("");
}
const printable=(format:"flyer"|"handout"|"social",brand:ResolvedSiteBrand,content:MarketingPackageContent,websiteUrl:string|null)=>{
  const social=format==="social",handout=format==="handout";
  const width=social?1080:816,height=social?1080:1056,padding=social?78:70;
  const background=social?brand.theme.ink:brand.theme.canvas;
  const foreground=social?brand.theme.canvas:brand.theme.ink;
  const ink=brand.theme.ink,canvas=brand.theme.canvas,accent=brand.theme.accent;
  const logo=brand.logo?.rightsConfirmed&&!brand.logo.revokedAt ? brand.logo : null;
  const headline=wrap(content.headline,social?22:handout?34:33,social?4:3);
  const headerY=social?246:handout?200:160;
  const messageY=social?690:handout?470:Math.max(440,headerY+headline.length*60+86);
  const captionY=height-124;
  // Text is fitted to the actual available space above the immutable footer.
  // Social graphics carry the full message separately as a caption.
  const lineGap=social?49:handout?34:36;
  const maxBodyLines=Math.max(1,Math.floor((captionY-94-messageY)/lineGap));
  const message=wrap(content.message,social?40:handout?56:56,Math.min(maxBodyLines,social?5:handout?12:12));
  const url=websiteUrl?wrap(websiteUrl,65,1)[0]:null;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(brand.displayName)} ${format}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  <rect x="0" y="0" width="${width}" height="${social?22:18}" fill="${social?accent:ink}"/>
  ${social?`<rect x="${padding}" y="214" width="130" height="12" fill="${accent}"/>`:""}
  ${handout?`<rect x="0" y="145" width="${width}" height="140" fill="${ink}" opacity=".08"/>`:""}
  <rect x="${padding}" y="76" width="55" height="55" fill="${social?canvas:ink}"/>
  ${logo?`<image href="${escape(logo.dataUrl)}" x="${padding}" y="76" width="55" height="55"/>`
    :`<text x="${padding+27}" y="113" fill="${social?ink:canvas}" text-anchor="middle" font-size="26"
      font-family="Georgia,serif">${escape(brand.displayName.slice(0,1).toUpperCase())}</text>`}
  <g font-family="${escape(brand.theme.bodyFont)}">
    <text x="${padding+78}" y="111" font-size="26" font-weight="bold" fill="${foreground}">${escape(brand.displayName.slice(0,43))}</text>
    ${svgText(headline,padding,headerY+50,social?76:60,social?66:handout?48:51,foreground)}
    <rect x="${padding}" y="${messageY-38}" width="95" height="8" fill="${accent}"/>
    ${svgText(message,padding,messageY+32,lineGap,social?31:handout?24:24,foreground)}
    <rect x="${padding}" y="${captionY-30}" width="${width-2*padding}" height="1" fill="${social?accent:brand.theme.secondary}"/>
    <text x="${padding}" y="${captionY}" font-size="21" fill="${foreground}">${escape(proposed)}</text>
    ${url?`<text x="${padding}" y="${captionY+38}" font-size="18" fill="${foreground}">${escape(url)}</text>`:""}
  </g></svg>`;
  return {format,templateId:"can-site-"+format,templateVersion:2,
    mimeType:"image/svg+xml",extension:"svg",body:svg,
    ...(social?{plainText:[content.headline,content.message,websiteUrl??""].filter(Boolean).join("\n\n")}:{}),};
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
  const mailLogo=brand.logo&&brand.logo.rightsConfirmed&&!brand.logo.revokedAt
    ? `<img src="${escape(brand.logo.dataUrl)}" alt="${escape(brand.logo.altText)}"
       width="56" height="56" style="display:inline-block;vertical-align:middle;margin-right:12px"/>`:"";
  const head=`<html lang="en"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1"></head>`;
  const action=websiteUrl
    ?`<p style="margin:20px 0"><a href="${escape(websiteUrl)}" style="background:${ink};
      color:${canvas};display:inline-block;padding:14px 22px;text-decoration:none">
      ${escape(content.callToAction||"Learn more")}</a></p>`:"";
  const html=`<!doctype html>${head}<body style="margin:0;background:${canvas};
    color:${ink};font-family:${escape(brand.theme.bodyFont)}">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
    <tr><td style="padding:28px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
      style="max-width:600px;margin:auto;border-collapse:collapse;background:#ffffff">
    <tr><td style="padding:28px 32px;border-top:8px solid ${ink}">
      <p style="font-size:18px;font-weight:bold">${mailLogo}${escape(brand.displayName)}</p>
      <h1 style="font-family:${escape(brand.theme.displayFont)};font-size:32px;line-height:1.2">${escape(content.headline)}</h1>
      <p style="font-size:16px;line-height:1.6;white-space:pre-wrap">${escape(content.message)}</p>
      ${action}
      <p style="font-size:13px;color:#334155">${escape(proposed)}</p>
    </td></tr></table></td></tr></table></body></html>`;
  return {format:"email",templateId:"can-site-email",templateVersion:1,
    mimeType:"text/html",extension:"html",body:html,
    plainText:`${brand.displayName}\n\n${content.headline}\n\n${content.message}\n\n${proposed}\n${websiteUrl??""}`};
}
