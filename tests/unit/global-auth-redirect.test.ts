import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { currentPageSignInUrl, isPublicCanPath, signInReturnUrl } from "@/domain/auth-route-policy";
import { accessLandingPath } from "@/domain/access-navigation";

const read=(file:string)=>readFileSync(file,"utf8");

describe("global protected-route authentication",()=>{
  it("defaults to protecting private modules and deep links",()=>{
    for(const path of ["/calendar","/class/abc","/launch/site","/launch/website",
      "/site-website","/teacher/gradebook","/student/courses","/platform","/sites/a"])
      expect(isPublicCanPath(path)).toBe(false);
  });
  it("preserves only explicitly public Site signup, discovery, recruitment and auth routes",()=>{
    for(const path of ["/access","/access/verify","/access/register","/landing",
      "/landing/cogic","/site/new","/explore","/interest-event","/family/interest"])
      expect(isPublicCanPath(path)).toBe(true);
    expect(isPublicCanPath("/access-private")).toBe(false);
    expect(isPublicCanPath("/landing-admin")).toBe(false);
    expect(isPublicCanPath("/sites/new")).toBe(false);
  });
  it("roundtrips the full safe path after sign-in without creating open redirects",()=>{
    const previous="/calendar?date=2026-11-20&event=b6744a3c-b9cc-4e2d-ad1d-30644f7fe5c3#details";
    const target=signInReturnUrl(previous);
    expect(new URLSearchParams(target.split("?")[1]).get("returnTo")).toBe(previous);
    expect(accessLandingPath("student",undefined,previous)).toBe(previous);
    expect(currentPageSignInUrl({
      pathname:"/launch/site",search:"?siteId=abc&module=site-information",hash:"#section",
    })).toContain(encodeURIComponent("/launch/site?siteId=abc&module=site-information#section"));
    expect(signInReturnUrl("//evil.example")).toBe("/access");
    expect(signInReturnUrl("https://evil.example")).toBe("/access");
    expect(signInReturnUrl("/access/verify")).toBe("/access");
  });
  it("enforces initial SSR, SPA and expiry handling through shared components",()=>{
    const root=read("src/routes/__root.tsx");
    const gate=read("src/components/shell/ProtectedRouteAuthGate.tsx");
    const session=read("src/components/shell/WorkspaceSession.tsx");
    expect(root).toContain('!isPublicCanPath(location.pathname)');
    expect(root).toContain('throw redirect({ to: "/access"');
    expect(root).toContain("<ProtectedRouteAuthGate>");
    expect(gate).toContain('if(!publicPage && !error && !session?.authenticated)');
    expect(gate).toContain("void getWorkspaceSession().then");
    expect(session).toContain('identity==="signed-out"');
    expect(session).toContain("currentPageSignInUrl(window.location)");
    expect(session).not.toContain('window.location.assign("/access")');
  });
});
