import { renderPdfDocument } from "@/platform/documents/pdf.server";

/** Academic credential content and identity; all PDF layout lives in the platform. */
export function academicDocumentPdf(input:{
 title:string;issuer:string;student:string;identifier:string;issuedAt:string;lines:string[];
}):Uint8Array {
 return renderPdfDocument({
  title:input.title,
  brand:{name:input.issuer,subtitle:"Institutional academic records"},
  footer:"Official document | Credential "+input.identifier,
  lines:["Student: "+input.student,"Credential ID: "+input.identifier,
   "Issued: "+input.issuedAt,"",...input.lines],
 });
}
