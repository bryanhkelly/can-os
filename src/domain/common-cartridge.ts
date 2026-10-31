import { inflateRawSync } from "node:zlib";

/**
 * Bounded Common Cartridge / Thin CC intake, preserving source identifiers.
 * This is NOT a conformance-certified CC importer. It reads the package manifest
 * and rejects unknown/insecure archive features instead of silently dropping them.
 * Binary content remains within the source archive until an authorized publishing
 * workflow verifies license and maps it into CAN's resources.
 */
const maxPackageBytes=50*1024*1024;
const maxManifestBytes=2*1024*1024;
export type CartridgeEntry={identifier:string;type:string;href:string|null;files:string[]};
export type CartridgeItem={identifier:string;identifierref:string|null;title:string;children:CartridgeItem[]};
export type CartridgePreview={
  profile:"common_cartridge"|"thin_common_cartridge";
  resources:CartridgeEntry[];
  outline:CartridgeItem[];
  notices:string[];
  manifestXml:string;
};

function safePath(value:string):string {
  const path=value.trim();
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("\0") ||
    path.split("/").includes("..") || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(path) ||
    path.includes("?") || path.includes("#"))
    throw new Error("Unsafe Common Cartridge resource path.");
  return path;
}
function decodeXml(value:string):string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g,(entity)=>{
    const name=entity.slice(1,-1);
    if(name==="amp")return "&";if(name==="lt")return "<";if(name==="gt")return ">";
    if(name==="quot")return '"';if(name==="apos")return "'";
    const point=name.startsWith("#x")?parseInt(name.slice(2),16):parseInt(name.slice(1),10);
    if(!Number.isSafeInteger(point)||point<=0||point>0x10ffff ||(point>=0xd800&&point<=0xdfff))
      throw new Error("Invalid XML character reference.");
    return String.fromCodePoint(point);
  });
}
function attributes(value:string):Record<string,string>{
  const attrs:Record<string,string>={};
  const regex=/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for(const m of value.matchAll(regex)){
    const name=m[1];
    if(!name)throw new Error("Malformed XML attribute.");
    if(Object.prototype.hasOwnProperty.call(attrs,name))throw new Error("Duplicate XML attribute.");
    attrs[name]=decodeXml(m[2]??m[3]??"");
  }
  return attrs;
}
function tag(value:string){return value.split(":").pop()?.toLowerCase()??"";}
type Node={name:string;attrs:Record<string,string>;text:string;children:Node[]};
function parseXml(xml:string):Node{
  if (xml.length>maxManifestBytes || /<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[|<\?xml-stylesheet\b/i.test(xml))
    throw new Error("Unsupported or unsafe XML manifest.");
  const roots:Node[]=[];
  const stack:Node[]=[];
  const tokenizer=/<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/g;
  const tokens=xml.match(tokenizer)??[];
  for(const value of tokens){
    if(value.startsWith("<?") || value.startsWith("<!--"))continue;
    if(value.startsWith("</")){
      const name=value.slice(2,-1).trim();
      const node=stack.pop();
      if(!node||node.name!==name)throw new Error("Malformed Common Cartridge manifest XML.");
      continue;
    }
    if(value.startsWith("<")){
      if(value.startsWith("<!"))throw new Error("Unsupported XML declaration.");
      const closed=value.endsWith("/>");
      const m=value.match(/^<([A-Za-z_][\w:.-]*)([\s\S]*?)\/?\s*>$/);
      if(!m)throw new Error("Malformed Common Cartridge XML tag.");
      const name=m[1];
      if(!name)throw new Error("Missing XML tag name.");
      const node:Node={name,attrs:attributes(m[2]??""),text:"",children:[]};
      if(stack.length)stack.at(-1)!.children.push(node);else roots.push(node);
      if(!closed)stack.push(node);
      if(stack.length>64)throw new Error("Manifest nesting limit exceeded.");
    }else if(stack.length){
      stack.at(-1)!.text+=decodeXml(value);
    }else if(value.trim())throw new Error("Text outside the XML document.");
    if(roots.length>1)throw new Error("Multiple XML root elements.");
  }
  const root=roots[0];
  if(stack.length||roots.length!==1||!root||tag(root.name)!=="manifest")
    throw new Error("Invalid Common Cartridge manifest root.");
  return root;
}
const named=(node:Node,name:string)=>node.children.filter(n=>tag(n.name)===name);
function parseItem(node:Node):CartridgeItem{
  const identifier=node.attrs.identifier;
  if(!identifier)throw new Error("Cartridge organization item missing identifier.");
  return {
    identifier,identifierref:node.attrs.identifierref??null,
    title:named(node,"title")[0]?.text.trim()??"",
    children:named(node,"item").map(parseItem),
  };
}
function parseManifest(xml:string):CartridgePreview{
 const root=parseXml(xml);
 const resourcesNode=named(root,"resources")[0];
 if(!resourcesNode)throw new Error("Common Cartridge resources element is missing.");
 const entries=named(resourcesNode,"resource");
 const seen=new Set<string>();
 const resources=entries.map(node=>{
  const {identifier,type}=node.attrs;
  if(!identifier||!type||seen.has(identifier))throw new Error("Missing or duplicate cartridge resource identifier/type.");
  seen.add(identifier);
  return {
    identifier,type,
    href:node.attrs.href?safePath(node.attrs.href):null,
    files:named(node,"file").map(file=>{
      if(!file.attrs.href)throw new Error("Cartridge file is missing href.");
      return safePath(file.attrs.href);
    }),
  };
 });
 const groups=named(root,"organizations").flatMap(x=>named(x,"organization"));
 const outline=groups.flatMap(x=>named(x,"item").map(parseItem));
 const dangling=(items:CartridgeItem[]):string[]=>items.flatMap(i=>[
   ...(i.identifierref&&!seen.has(i.identifierref)?[i.identifierref]:[]),
   ...dangling(i.children),
 ]);
 const missing=dangling(outline);
 const ns=JSON.stringify(root.attrs).toLowerCase();
 const thin=/thin/.test(ns);
 const notices=[
   ...new Set(missing.map(id=>"Unresolved resource reference: "+id)),
   ...resources.filter(r=>!/webcontent|weblink|associatedcontent|imsbasiclti|lti/i.test(r.type))
      .map(r=>"Requires a separate assessment/application adapter: "+r.identifier+" ("+r.type+")"),
 ];
 return {profile:thin?"thin_common_cartridge":"common_cartridge",resources,outline,notices,manifestXml:xml};
}
function crc32(bytes:Uint8Array){
 let crc=0xffffffff;
 for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=(crc&1)?(crc>>>1)^0xedb88320:crc>>>1;}
 return (crc^0xffffffff)>>>0;
}
/** Read one normalized file from a ZIP central directory, rejecting traversal,
 * duplicate manifests, encryption, ZIP64, malformed bounds and oversized output. */
export function inspectCommonCartridgeZip(zip:Uint8Array):CartridgePreview {
 if(zip.length<22||zip.length>maxPackageBytes)throw new Error("Cartridge archive size unsupported.");
 const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
 let eocd=-1;
 for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--){
  if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}
 }
 if(eocd<0)throw new Error("Not a supported ZIP cartridge.");
 const count=view.getUint16(eocd+10,true);
 const dirSize=view.getUint32(eocd+12,true);
 const dirOffset=view.getUint32(eocd+16,true);
 if(count>3000||count===0xffff||dirOffset+dirSize>eocd)
   throw new Error("Unsupported ZIP central directory.");
 const decoder=new TextDecoder("utf-8",{fatal:true});
 let offset=dirOffset;
 let manifest:Uint8Array|null=null;
 for(let i=0;i<count;i++){
  if(offset+46>zip.length||view.getUint32(offset,true)!==0x02014b50)throw new Error("Invalid ZIP directory entry.");
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true);
  const crc=view.getUint32(offset+16,true),compressed=view.getUint32(offset+20,true);
  const expanded=view.getUint32(offset+24,true),nameSize=view.getUint16(offset+28,true);
  const extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true);
  const local=view.getUint32(offset+42,true);
  if(offset+46+nameSize+extra+comment>zip.length)throw new Error("Truncated ZIP entry.");
  const path=decoder.decode(zip.subarray(offset+46,offset+46+nameSize));
  safePath(path.endsWith("/")?path.slice(0,-1):path);
  if(flags&1||compressed===0xffffffff||expanded===0xffffffff||local===0xffffffff)
    throw new Error("Encrypted and ZIP64 cartridges are not supported.");
  if(path==="imsmanifest.xml"){
    if(manifest)throw new Error("Duplicate Common Cartridge manifest.");
    if(expanded>maxManifestBytes||compressed>maxPackageBytes)throw new Error("Manifest exceeds allowed size.");
    if(local+30>zip.length||view.getUint32(local,true)!==0x04034b50)
      throw new Error("Invalid local ZIP header.");
    const localName=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
    const start=local+30+localName+localExtra;
    if(start+compressed>zip.length)throw new Error("Truncated ZIP manifest.");
    const bytes=zip.subarray(start,start+compressed);
    const unpacked=method===0?bytes:method===8?
      inflateRawSync(bytes,{maxOutputLength:maxManifestBytes}):null;
    if(!unpacked||unpacked.length!==expanded||crc32(unpacked)!==crc)
      throw new Error("Manifest compression, length or checksum is invalid.");
    manifest=unpacked;
  }
  offset+=46+nameSize+extra+comment;
 }
 if(!manifest)throw new Error("imsmanifest.xml is missing.");
 return parseManifest(decoder.decode(manifest));
}
/** A manifest exported independently can also be inspected without a ZIP wrapper. */
export function inspectCommonCartridgeManifest(xml:string):CartridgePreview{
 return parseManifest(xml);
}

/** Read only an explicitly referenced, bounded web-link descriptor from the ZIP.
 * Do not extract HTML/script payloads or treat the whole archive as publishable. */
export function extractCommonCartridgeWebLink(zip:Uint8Array,resourcePath:string):
  {title:string;url:string} {
  const requested=safePath(resourcePath);
  if(zip.length<22||zip.length>maxPackageBytes)throw new Error("Cartridge archive size unsupported.");
  const view=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
  let eocd=-1;
  for(let p=zip.length-22;p>=Math.max(0,zip.length-65557);p--){
    if(view.getUint32(p,true)===0x06054b50){eocd=p;break;}
  }
  if(eocd<0)throw new Error("Invalid cartridge ZIP directory.");
  const count=view.getUint16(eocd+10,true);
  const directorySize=view.getUint32(eocd+12,true);
  let offset=view.getUint32(eocd+16,true);
  if(!count||count>3000||count===0xffff||offset+directorySize>eocd)
    throw new Error("Invalid cartridge ZIP directory.");
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let descriptor:string|null=null;
  for(let index=0;index<count;index++){
    if(offset+46>zip.length||view.getUint32(offset,true)!==0x02014b50)
      throw new Error("Invalid cartridge ZIP file entry.");
    const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true);
    const expectedCrc=view.getUint32(offset+16,true);
    const compressed=view.getUint32(offset+20,true),expanded=view.getUint32(offset+24,true);
    const nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true);
    const comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
    if(offset+46+nameLength+extra+comment>zip.length)
      throw new Error("Truncated cartridge ZIP directory.");
    const name=decoder.decode(zip.subarray(offset+46,offset+46+nameLength));
    safePath(name.endsWith("/")?name.slice(0,-1):name);
    if(name===requested){
      if(descriptor!==null||flags&1||compressed===0xffffffff||expanded===0xffffffff||
          local===0xffffffff||expanded>64*1024||compressed>128*1024)
        throw new Error("Unsupported or duplicated web-link resource.");
      if(local+30>zip.length||view.getUint32(local,true)!==0x04034b50||
          view.getUint16(local+8,true)!==method)
        throw new Error("Invalid cartridge ZIP local entry.");
      const localNameSize=view.getUint16(local+26,true),localExtra=view.getUint16(local+28,true);
      const start=local+30+localNameSize+localExtra;
      if(start+compressed>zip.length||
          decoder.decode(zip.subarray(local+30,local+30+localNameSize))!==requested)
        throw new Error("Cartridge resource path mismatch.");
      const data=zip.subarray(start,start+compressed);
      const inflated=method===0?data:method===8?
        inflateRawSync(data,{maxOutputLength:64*1024}):null;
      if(!inflated||inflated.length!==expanded||crc32(inflated)!==expectedCrc)
        throw new Error("Cartridge resource integrity check failed.");
      descriptor=decoder.decode(inflated);
    }
    offset+=46+nameLength+extra+comment;
  }
  if(descriptor===null)throw new Error("Referenced web-link resource is missing.");
  if(/<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[|<\?xml-stylesheet\b/i.test(descriptor))
    throw new Error("Unsafe web-link XML.");
  if(!/<(?:[\w.-]+:)?webLink(?:\s|>)/i.test(descriptor))
    throw new Error("Expected an IMS Common Cartridge web-link descriptor.");
  const links=[...descriptor.matchAll(/<(?:[\w.-]+:)?url\b([^>]*)\/?\s*>/gi)];
  if(links.length!==1)throw new Error("Web-link descriptor must have one URL.");
  const href=attributes(links[0]![1]??"").href;
  if(!href||href.length>2048)throw new Error("Missing or oversized web-link URL.");
  const url=new URL(href);
  if(url.protocol!=="https:"||url.username||url.password||!url.hostname||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(url.hostname))
    throw new Error("Web-link must use a safe HTTPS destination.");
  const titleMatch=descriptor.match(/<(?:[\w.-]+:)?title\b[^>]*>([^<]*)<\/(?:[\w.-]+:)?title>/i);
  const title=titleMatch?decodeXml(titleMatch[1]!.trim()):url.hostname;
  if(!title||title.length>200)throw new Error("Invalid Common Cartridge web-link title.");
  return {title,url:url.href};
}
