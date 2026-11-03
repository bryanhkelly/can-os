import { hasRegistrarAuthority } from "@/domain/school-roles";

/** Fixed application destinations only; never accept a caller-supplied redirect. */
export function accessLandingPath(role: string, launchSiteId?: string): string {
 if(hasRegistrarAuthority(role)&&launchSiteId)return "/operations/launch?siteId="+encodeURIComponent(launchSiteId);
 const home:Record<string,string>={student:"/",teacher:"/teacher/missing-work",guardian:"/guardian/academics",registrar:"/admissions",specialist:"/coach",counselor:"/counselor"};
 return Object.hasOwn(home,role)?home[role]! : "/access";
}
export const accessFormErrors={
 invalid:"Unable to sign in. Check your demo credentials or request a new access link.",
 unavailable:"Sign-in is temporarily unavailable. Please try again shortly.",
 rate_limited:"Sign-in requests are temporarily limited. Please try again shortly.",
} as const;
