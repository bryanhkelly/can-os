/**
 * Minimal one-page PDF writer for institution-issued academic documents.
 * Escapes PDF text and computes byte offsets; rejects unsupported glyphs
 * rather than silently altering legal names on official credentials.
 */
function pdfText(value:string):string {
 if (/[^\x20-\x7e]/.test(value)) throw new Error("Document contains characters requiring an embedded Unicode font");
 return value.replace(/\\/g,"\\\\").replace(/\(/g,"\\(").replace(/\)/g,"\\)");
}
export function academicDocumentPdf(input:{title:string;issuer:string;student:string;identifier:string;issuedAt:string;lines:string[]}):Uint8Array {
 const lines=[input.title,"",input.issuer,"Student: "+input.student,"Credential ID: "+input.identifier,"Issued: "+input.issuedAt,"",...input.lines];
 if(lines.length>43 || lines.some(line=>line.length>96)) throw new Error("Academic document exceeds printable bounds");
 const commands=lines.map((line,i)=>`BT /F1 ${i===0?18:10} Tf 45 ${760-i*16} Td (${pdfText(line)}) Tj ET`).join("\n");
 const objects=[
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  `<< /Length ${Buffer.byteLength(commands,"ascii")} >>\nstream\n${commands}\nendstream`,
 ];
 let pdf="%PDF-1.4\n";const offsets=[0];
 for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf,"ascii"));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(pdf,"ascii");
 pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,"0")+" 00000 n \n";
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
 return Buffer.from(pdf,"ascii");
}
