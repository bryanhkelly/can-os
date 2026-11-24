/** Bound actual streamed bytes, not just the untrusted Content-Length header. */
export async function readBoundedBodyBytes(message:Request|Response,maxBytes:number):Promise<Uint8Array|null>{
 if(!Number.isSafeInteger(maxBytes)||maxBytes<0)throw new RangeError("Invalid body byte limit");
 const declared=message.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))return null;
 if(!message.body)return new Uint8Array();
 const reader=message.body.getReader();
 const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){
   const part=await reader.read();if(part.done)break;
   size+=part.value.byteLength;
   if(size>maxBytes){await reader.cancel().catch(()=>undefined);return null;}
   chunks.push(part.value);
  }
 }finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 return bytes;
}

/** Retain the existing request-facing contract for webhook and route callers. */
export function readBoundedRequestBytes(request:Request,maxBytes:number):Promise<Uint8Array|null>{
 return readBoundedBodyBytes(request,maxBytes);
}

/** External providers must supply a bounded, valid UTF-8 response. */
export async function readBoundedResponseText(response:Response,maxBytes:number):Promise<string>{
 if(!response.body)throw new Error("Provider returned no content");
 const bytes=await readBoundedBodyBytes(response,maxBytes);
 if(bytes===null)throw new Error("Provider response exceeds limit");
 return new TextDecoder("utf-8",{fatal:true}).decode(bytes);
}
