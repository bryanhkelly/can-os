import { hasRegistrarAuthority } from "@/domain/school-roles";

const INTERNAL_ORIGIN = "https://can-os.invalid";

/** Accept only local application paths; never turn a sign-in return into an open redirect. */
export function safeAccessReturnTo(value: unknown): string | undefined {
 if(typeof value!=="string"||!value.startsWith("/")||value.startsWith("//")||
   value.includes("\\")||[...value].some(character=>{
    const code=character.charCodeAt(0);
    return code<=0x1f||code===0x7f;
   }))return undefined;
 try{
  const url=new URL(value,INTERNAL_ORIGIN);
  if(url.origin!==INTERNAL_ORIGIN||url.pathname==="/access"||url.pathname.startsWith("/access/"))return undefined;
  return url.pathname+url.search+url.hash;
 }catch{return undefined;}
}

/** Fixed application destinations remain the fallback when no safe return path is supplied. */
export function accessLandingPath(role: string, launchSiteId?: string, returnTo?: unknown): string {
 const safeReturnTo=safeAccessReturnTo(returnTo);
 if(safeReturnTo)return safeReturnTo;
 if(hasRegistrarAuthority(role)&&launchSiteId)return "/operations/launch?siteId="+encodeURIComponent(launchSiteId);
 const home:Record<string,string>={student:"/",teacher:"/teacher/missing-work",guardian:"/guardian/academics",registrar:"/admissions",specialist:"/coach",counselor:"/counselor"};
 return Object.hasOwn(home,role)?home[role]! : "/access";
}
export const accessFormErrors={
 invalid:"Unable to sign in. Check your demo credentials or request a new access link.",
 unavailable:"Sign-in is temporarily unavailable. Please try again shortly.",
 rate_limited:"Sign-in requests are temporarily limited. Please try again shortly.",
} as const;
