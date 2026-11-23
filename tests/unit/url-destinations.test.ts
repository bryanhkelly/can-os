import { describe, expect, it } from "vitest";
import { absoluteDestinationUrl, buildUrlDestination } from "@/domain/url-destinations";
import { encodeUuidForPath } from "@/domain/opaque-url-id";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
const token = encodeUuidForPath(uuid);
const identity = {organizationSlug:"cogic",siteSlug:"glad-tidings"};
describe("typed URL destination registry", () => {
  it("generates readable Site workspace, profile and Launch destinations", () => {
    expect(buildUrlDestination({kind:"site-workspace",siteId:uuid,identity}).href)
      .toBe("/o/cogic/glad-tidings");
    expect(buildUrlDestination({kind:"site-profile",siteId:uuid,identity}).href)
      .toBe("/o/cogic/glad-tidings/profile");
    expect(buildUrlDestination({kind:"site-launch",siteId:uuid,identity,module:"create-outreach"}).href)
      .toBe("/o/cogic/glad-tidings/launch?module=create-outreach");
    expect(buildUrlDestination({kind:"site-workspace",siteId:uuid}).href)
      .toBe("/sites/" + token);
  });
  it("compacts Class, Action and assignment identifiers", () => {
    expect(buildUrlDestination({kind:"class",classId:uuid}).href).toBe("/class/"+token);
    expect(buildUrlDestination({kind:"action",actionId:uuid}).href).toBe("/actions/"+token);
    expect(buildUrlDestination({kind:"assignment",assessmentId:uuid}).href)
      .toBe("/student/assignments/"+token);
    expect(() => buildUrlDestination({kind:"action",actionId:"../evil"})).toThrow();
  });
  it("distinguishes revocable public navigation from private membership URLs", () => {
    const go=buildUrlDestination({kind:"go",code:"K7x2p9AaB3cD"});
    expect(go).toMatchObject({href:"/go/K7x2p9AaB3cD",audience:"revocable-outreach",requiresSignIn:false});
    expect(buildUrlDestination({kind:"site-workspace",siteId:uuid}).requiresSignIn).toBe(true);
    expect(() => buildUrlDestination({kind:"go",code:"../../admin"})).toThrow();
  });
  it("allows published website hosts only, never schemes, paths or script protocols", () => {
    const web=buildUrlDestination({kind:"published-site",host:"school.can-os.com",page:"/about"});
    expect(web.href).toBe("https://school.can-os.com/about");
    for(const host of ["evil.com/path","https://school.can-os.com","bad..com","-bad.example.com","a:1234"]) {
      expect(() => buildUrlDestination({kind:"published-site",host})).toThrow();
    }
  });
  it("never exposes a private editor preview or token-bearing URL as a copy destination", () => {
    expect(() => buildUrlDestination({kind:"published-site",host:"school.can-os.com",page:"/login" as never}))
      .toThrow("Unsupported published Site page");
    expect(buildUrlDestination({kind:"site-website",siteId:uuid,identity}).href)
      .toBe("/o/cogic/glad-tidings/website");
    expect(buildUrlDestination({kind:"site-website",siteId:uuid}).href)
      .toBe("/site-website?siteId="+token);
  });

  it("copies absolute URLs without accepting open redirects", () => {
    const privateRoute=buildUrlDestination({kind:"site-workspace",siteId:uuid});
    expect(absoluteDestinationUrl(privateRoute,"https://app.example.com"))
      .toBe("https://app.example.com/sites/"+token);
    expect(() => absoluteDestinationUrl(privateRoute,"http://example.com")).toThrow();
    expect(absoluteDestinationUrl(buildUrlDestination({kind:"published-site",host:"school.can-os.com"}),
      "https://app.example.com")).toBe("https://school.can-os.com/");
  });
});
