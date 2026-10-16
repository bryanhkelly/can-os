import {createHmac,createHash,randomUUID} from "node:crypto";

const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
const hmac=(key:Buffer|string,value:string)=>createHmac("sha256",key).update(value).digest();
const escapeKey=(key:string)=>key.split("/").map(encodeURIComponent).join("/");
export function r2Config(){
 const {CAN_R2_ACCOUNT_ID:account,CAN_R2_BUCKET:bucket,CAN_R2_ACCESS_KEY_ID:accessKey,CAN_R2_SECRET_ACCESS_KEY:secret}=process.env;
 if(!account||!/^[a-f0-9]{32}$/.test(account)||!bucket||!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket)||!accessKey||!secret)throw new Error("Private R2 storage is not configured");
 return {account,bucket,accessKey,secret};
}
export function newDocumentKey(applicationId:string,requirementId:string){
 if(!/^[0-9a-f-]{36}$/i.test(applicationId)||!/^[0-9a-f-]{36}$/i.test(requirementId))throw new Error("Invalid document scope");
 return "enrollment/"+applicationId+"/"+requirementId+"/"+randomUUID();
}
/** Short-lived one-object SigV4 URL; credentials never leave the server. */
export function signR2Object(method:"PUT"|"HEAD"|"GET",key:string,contentType?:string,expires=180){
 if(expires<1||expires>900||!/^enrollment\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i.test(key))throw new Error("Invalid R2 signing request");
 const cfg=r2Config(),now=new Date(),stamp=now.toISOString().replace(/[:-]|\.\d{3}/g,""),day=stamp.slice(0,8);
 const host=cfg.account+".r2.cloudflarestorage.com",scope=day+"/auto/s3/aws4_request";
 const path="/"+cfg.bucket+"/"+escapeKey(key);
 const signedHeaders=contentType?"content-type;host":"host";
 const headers=contentType?"content-type:"+contentType+"\nhost:"+host+"\n":"host:"+host+"\n";
 const params=new URLSearchParams({"X-Amz-Algorithm":"AWS4-HMAC-SHA256","X-Amz-Credential":cfg.accessKey+"/"+scope,"X-Amz-Date":stamp,"X-Amz-Expires":String(expires),"X-Amz-SignedHeaders":signedHeaders});
 params.sort();
 const query=params.toString().replace(/\+/g,"%20").replace(/%7E/gi,"~");
 const canonical=[method,path,query,headers,signedHeaders,"UNSIGNED-PAYLOAD"].join("\n");
 const stringToSign=["AWS4-HMAC-SHA256",stamp,scope,sha(canonical)].join("\n");
 const kDate=hmac("AWS4"+cfg.secret,day),kRegion=hmac(kDate,"auto"),kService=hmac(kRegion,"s3"),kSign=hmac(kService,"aws4_request");
 const signature=createHmac("sha256",kSign).update(stringToSign).digest("hex");
 return "https://"+host+path+"?"+query+"&X-Amz-Signature="+signature;
}
export const allowedDocumentMime=new Set(["application/pdf","image/jpeg","image/png"]);
export function validateDocumentUpload(fileName:string,mimeType:string,size:number){
 if(fileName.length<1||fileName.length>150||/[\\/\x00-\x1f]/.test(fileName))throw new Error("Invalid file name");
 if(!allowedDocumentMime.has(mimeType))throw new Error("Only PDF, JPEG and PNG files are supported");
 if(!Number.isSafeInteger(size)||size<1||size>10*1024*1024)throw new Error("Document size must be 1 byte to 10 MB");
}
