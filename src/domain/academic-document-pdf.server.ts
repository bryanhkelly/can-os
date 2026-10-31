import { renderPdfDocument } from "@/platform/documents/pdf.server";

/** Academic credential content policy; PDF encoding and pagination are shared. */
export function academicDocumentPdf(input:{
 title:string;issuer:string;student:string;identifier:string;issuedAt:string;lines:string[];
}):Uint8Array {
 return renderPdfDocument({
  title:input.title,
  lines:["",input.issuer,"Student: "+input.student,"Credential ID: "+input.identifier,
   "Issued: "+input.issuedAt,"",...input.lines],
 });
}
