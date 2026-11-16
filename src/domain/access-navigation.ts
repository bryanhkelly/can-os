import { hasRegistrarAuthority } from "@/domain/school-roles";

const INTERNAL_ORIGIN = "https://can-os.invalid";

export const accessReturnCookie = "can_os_access_return";

export function accessReturnCookieHeader(returnTo: string | undefined, secure: boolean) {
 const pending=returnTo&&returnTo!=="/";
 return `${accessReturnCookie}=${pending?"1":""}; Path=/; Max-Age=${pending?120:0}; SameSite=Lax${secure?"; Secure":""}`;
}

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

/** Router locations expose the fragment without its leading hash separator. */
export function accessReturnToFromLocation(location: { pathname: string; searchStr: string; hash: string }) {
 const fragment=location.hash?`#${location.hash.replace(/^#/,"")}`:"";
 return safeAccessReturnTo(`${location.pathname}${location.searchStr}${fragment}`);
}

/** Generic entry points that only lead to a default dashboard. A specific saved page still wins. */
const genericReturnPaths=new Set(["/","/home","/launch"]);

/** Fixed application destinations remain the fallback when no safe return path is supplied. */
export function accessLandingPath(role: string, launchSiteId?: string, returnTo?: unknown, homeSiteId?: string): string {
 const safeReturnTo=safeAccessReturnTo(returnTo);
 // A new school's first sign-in lands in its guided launcher, not a dashboard;
 // the launcher itself offers a skip to the dashboard.
 if(hasRegistrarAuthority(role)&&launchSiteId&&(!safeReturnTo||genericReturnPaths.has(safeReturnTo)))
  return "/launch/site?siteId="+encodeURIComponent(launchSiteId);
 if(safeReturnTo&&!genericReturnPaths.has(safeReturnTo))return safeReturnTo;
 // An operating school is a workspace, not a school-creation journey.
 if(hasRegistrarAuthority(role)&&homeSiteId)
  return "/sites/"+encodeURIComponent(homeSiteId);
 if(safeReturnTo)return safeReturnTo;
 const home:Record<string,string>={account_holder:"/account/",student:"/",teacher:"/teacher/missing-work",guardian:"/guardian/students",registrar:"/admissions",specialist:"/home",counselor:"/home"};
 return Object.hasOwn(home,role)?home[role]! : "/access";
}
export const accessFormErrors={
 invalid:"Unable to sign in. Check your demo credentials or request a new access link.",
 unavailable:"Sign-in is temporarily unavailable. Please try again shortly.",
 rate_limited:"Sign-in requests are temporarily limited. Please try again shortly.",
} as const;
