/** Bound actual streamed bytes, not just the untrusted Content-Length header. */
export async function readBoundedRequestBytes(request:Request,maxBytes:number):Promise<Uint8Array|null>{
 const declared=request.headers.get("content-length");
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>maxBytes))return null;
 if(!request.body)return new Uint8Array();
 const reader=request.body.getReader();
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
