/** Validate file magic bytes rather than trusting client-supplied MIME type. */
export function matchesEnrollmentDocumentSignature(mimeType:string,bytes:Uint8Array):boolean {
 if(mimeType==="application/pdf")return bytes.length>=5&&bytes[0]===0x25&&bytes[1]===0x50&&bytes[2]===0x44&&bytes[3]===0x46&&bytes[4]===0x2d;
 if(mimeType==="image/jpeg")return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 if(mimeType==="image/png")return bytes.length>=8&&[137,80,78,71,13,10,26,10].every((byte,i)=>bytes[i]===byte);
 return false;
}
