import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

/** A public origin is not a feature flag. Every printed Go Link must share
 * one explicitly approved, canonical application hostname.
 * Preview Host/Origin headers are not trusted for production link generation.
 */
export const getCanonicalGoLinkShareOrigin=createServerFn({method:"GET"})
  .handler(async()=>{
    setResponseHeader("Cache-Control","private, no-store");
    const configured=process.env.CAN_ACCESS_PUBLIC_ORIGIN ??
      (process.env.NODE_ENV==="development"
        ?new URL(getRequest().url).origin:undefined);
    if(!configured)throw new Error("Approved application share origin not configured");
    const url=new URL(configured);
    if(url.username || url.password || url.search || url.hash ||
      url.pathname!=="/" ||
      (url.protocol!=="https:" && !(url.protocol==="http:" &&
       process.env.NODE_ENV==="development" &&
       ["localhost","127.0.0.1"].includes(url.hostname))))
      throw new Error("Approved application share origin is invalid");
    return url.origin;
  });
