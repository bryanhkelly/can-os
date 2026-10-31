/**
 * Shared server-only PDF renderer. Domain modules supply content; this module
 * owns pagination, line wrapping, branding, headers/footers, and PDF syntax.
 *
 * Standard PDF fonts use WinAnsi, not Unicode. Unsupported scripts fail closed
 * until an embedded Unicode font renderer is installed.
 */
export type PdfDocument={
 title:string;
 lines:readonly string[];
 pageSize?:{width:number;height:number};
 brand?:{name:string;subtitle?:string};
 footer?:string;
};
const MARGIN=46;
const LEADING=15;
const MAX_PAGES=200;
function pdfString(value:string):string{
 // PDF standard font WinAnsi encoding: support Latin-1 letters and punctuation.
 const cp1252=new Map<number,number>([
  [0x20ac,0x80],[0x201a,0x82],[0x0192,0x83],[0x201e,0x84],
  [0x2026,0x85],[0x2020,0x86],[0x2021,0x87],[0x02c6,0x88],
  [0x2030,0x89],[0x0160,0x8a],[0x2039,0x8b],[0x0152,0x8c],
  [0x017d,0x8e],[0x2018,0x91],[0x2019,0x92],[0x201c,0x93],
  [0x201d,0x94],[0x2022,0x95],[0x2013,0x96],[0x2014,0x97],
  [0x02dc,0x98],[0x2122,0x99],[0x0161,0x9a],[0x203a,0x9b],
  [0x0153,0x9c],[0x017e,0x9e],[0x0178,0x9f],
 ]);
 let encoded="";
 for(const char of value){
  const point=char.codePointAt(0)!;
  const byte=point>=32&&point<=126||point>=160&&point<=255?point:cp1252.get(point);
  if(byte===undefined)throw new Error("PDF text requires an embedded Unicode font for this script");
  if(byte===40||byte===41||byte===92)encoded+="\\"+String.fromCharCode(byte);
  else if(byte<32||byte>126)encoded+="\\"+byte.toString(8).padStart(3,"0");
  else encoded+=String.fromCharCode(byte);
 }
 return encoded;
}
function wrapLine(line:string,maxChars:number):string[]{
 if(!line)return [""];
 const out:string[]=[];
 for(const paragraph of line.split("\n")){
  let current="";
  for(const word of paragraph.split(/\s+/)){
   if(!word)continue;
   if(word.length>maxChars)throw new Error("PDF contains an unbreakable line exceeding page width");
   if(current.length+word.length+1>maxChars){out.push(current);current=word;}
   else current=current?current+" "+word:word;
  }
  out.push(current);
 }
 return out;
}
export function renderPdfDocument(input:PdfDocument):Uint8Array{
 const width=input.pageSize?.width??612,height=input.pageSize?.height??792;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<300||height<400)throw new Error("Invalid PDF page dimensions");
 const maxChars=Math.floor((width-2*MARGIN)/5.5);
 const body=input.lines.flatMap(line=>wrapLine(line,maxChars));
 const pageCapacity=Math.max(1,Math.floor((height-160)/LEADING));
 const pages:string[][]=[];
 for(let i=0;i<body.length;i+=pageCapacity)pages.push(body.slice(i,i+pageCapacity));
 if(!pages.length)pages.push([]);
 if(pages.length>MAX_PAGES)throw new Error("PDF exceeds maximum page count");
 const pageIds=pages.map((_,i)=>4+i*2);
 const objects:string[]=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  `<< /Type /Pages /Kids [${pageIds.map(id=>id+" 0 R").join(" ")}] /Count ${pages.length} >>`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
 ];
 for(let p=0;p<pages.length;p++){
  const commands:string[]=[];
  const text=(value:string,size:number,x:number,y:number)=>commands.push(`BT /F1 ${size} Tf ${x} ${y} Td (${pdfString(value)}) Tj ET`);
  if(input.brand?.name)text(input.brand.name,11,MARGIN,height-40);
  if(input.brand?.subtitle)text(input.brand.subtitle,8,MARGIN,height-55);
  text(input.title,p===0?18:12,MARGIN,height-85);
  commands.push(`${MARGIN} ${height-97} m ${width-MARGIN} ${height-97} l S`);
  for(let i=0;i<pages[p]!.length;i++)text(pages[p]![i]!,10,MARGIN,height-120-i*LEADING);
  commands.push(`${MARGIN} 42 m ${width-MARGIN} 42 l S`);
  if(input.footer)text(input.footer,8,MARGIN,28);
  text(`Page ${p+1} of ${pages.length}`,8,width-MARGIN-70,28);
  const stream=commands.join("\n");
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[p]!+1} 0 R >>`);
  objects.push(`<< /Length ${Buffer.byteLength(stream,"ascii")} >>\nstream\n${stream}\nendstream`);
 }
 let pdf="%PDF-1.4\n";const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,"ascii"));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(pdf,"ascii");
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
 return Buffer.from(pdf,"ascii");
}
