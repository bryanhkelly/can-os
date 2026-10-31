/**
 * Shared server-side PDF rendering infrastructure.
 * Callers provide document content and layout; this module owns pagination,
 * PDF syntax, encoding checks, and byte offsets.
 */
export type PdfDocument = {
 title: string;
 lines: readonly string[];
 pageSize?: {width:number;height:number};
};
function escapePdfText(value:string):string {
 if (/[^\x20-\x7e]/.test(value)) throw new Error("PDF text requires an embedded Unicode font");
 return value.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
export function renderPdfDocument(input:PdfDocument):Uint8Array {
 const width=input.pageSize?.width??612;
 const height=input.pageSize?.height??792;
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<300||height<400)throw new Error("Invalid PDF page dimensions");
 const lines=[input.title,...input.lines];
 if(lines.some(line=>line.length>96))throw new Error("PDF line exceeds printable width");
 const pageCapacity=Math.floor((height-90)/16);
 const pages:Array<string[]>=[];for(let i=0;i<lines.length;i+=pageCapacity)pages.push(lines.slice(i,i+pageCapacity));
 if(!pages.length)pages.push([]);
 if(pages.length>200)throw new Error("PDF exceeds maximum page count");
 const pageIds=pages.map((_,i)=>4+i*2);
 const fontId=3;
 const objects:string[]=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  `<< /Type /Pages /Kids [${pageIds.map(id=>id+" 0 R").join(" ")}] /Count ${pages.length} >>`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
 ];
 for(let page=0;page<pages.length;page++){
  const pageId=pageIds[page]!;
  const stream=pages[page]!.map((line,i)=>`BT /F1 ${page===0&&i===0?18:10} Tf 45 ${height-45-i*16} Td (${escapePdfText(line)}) Tj ET`).join("\n");
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${pageId+1} 0 R >>`);
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
