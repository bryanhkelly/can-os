import { z } from "zod";

const corsSchema = z.object({
  rules: z.array(z.object({
    allowed: z.object({
      origins: z.array(z.string()).min(1),
      methods: z.array(z.string()).min(1),
      headers: z.array(z.string()),
    }),
  })).min(1),
});
export const requiredUploadCorsHeaders = ["content-type", "if-none-match"] as const;

/** Validate an exported Cloudflare R2 CORS policy; never change a bucket. */
export function checkR2Cors(value: unknown, approvedOrigins: string[]): string[] {
  const parsed=corsSchema.safeParse(value);
  if(!parsed.success)return ["Expected Cloudflare CORS configuration with rules[].allowed.{origins,methods,headers}."];
  if(!approvedOrigins.length)return ["At least one explicit approved origin is required."];
  const issues:string[]=[];
  for(const origin of approvedOrigins){
    try { if(new URL(origin).origin!==origin||!/^https?:\/\//.test(origin))issues.push(`Invalid approved origin: ${origin}`); }
    catch { issues.push(`Invalid approved origin: ${origin}`); }
  }
  for(const {allowed} of parsed.data.rules){
    if(allowed.origins.some(origin=>!approvedOrigins.includes(origin)))issues.push("CORS includes an unapproved or wildcard origin.");
    if(allowed.headers.includes("*"))issues.push("CORS headers must be explicit, not wildcard.");
  }
  for(const origin of approvedOrigins){
    const supported=parsed.data.rules.some(({allowed})=>
      allowed.origins.includes(origin)&&allowed.methods.includes("PUT")&&
      requiredUploadCorsHeaders.every(header=>allowed.headers.some(value=>value.toLowerCase()===header)));
    if(!supported)issues.push(`${origin} requires a PUT rule allowing Content-Type and If-None-Match together.`);
  }
  return issues;
}
