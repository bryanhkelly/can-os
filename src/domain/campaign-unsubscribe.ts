import {readBoundedRequestBytes} from "./bounded-request-body";
const MAX_UNSUBSCRIBE_BYTES=4096;
export function campaignUnsubscribeToken(request:Request){
 const values=new URL(request.url).searchParams.getAll("token");
 return values.length===1&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(values[0])?values[0]:null;
}
/** RFC 8058: accept both standard POST encodings; GET never mutates. */
export async function validateCampaignUnsubscribe(request:Request):Promise<200|400|413>{
 if(request.method!=="POST")return 400;
 const type=request.headers.get("content-type")??"";
 const mediaType=type.split(";")[0].trim().toLowerCase();
 if(mediaType!=="application/x-www-form-urlencoded"&&mediaType!=="multipart/form-data")return 400;
 try{
  const bytes=await readBoundedRequestBytes(request,MAX_UNSUBSCRIBE_BYTES);
  if(bytes===null)return 413;
  const form=await new Response(new Uint8Array(bytes),{headers:{"Content-Type":type}}).formData();
  const fields=Array.from(form.entries());
  return fields.length===1&&fields[0][0]==="List-Unsubscribe"&&fields[0][1]==="One-Click"?200:400;
 }catch{return 400;}
}
