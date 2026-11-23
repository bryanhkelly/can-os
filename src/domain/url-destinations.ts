import { decodeUuidPathParam, encodeUuidForPath } from "./opaque-url-id";
import { friendlySiteBase, friendlySiteLaunchHref, friendlySiteWebsiteHref, type FriendlySiteIdentity } from "./friendly-site-urls";
import { studentAssignmentHref, type StudentAssignmentFilter } from "./student-assignment-navigation";
import { goCodeSchema } from "./site-go-links";
import { isPublicSitePagePath, type PublicSitePath } from "./public-site-paths";

/** Typed destinations, not an arbitrary URL shortener. Share tokens, access
 * callbacks and editor previews are intentionally NOT supported.
 */
export type UrlDestination =
  | { kind: "site-workspace" | "site-profile" | "site-launch" | "site-website";
      siteId: string; identity?: FriendlySiteIdentity; module?: string }
  | { kind: "class"; classId: string }
  | { kind: "action"; actionId: string }
  | { kind: "assignment"; assessmentId: string; sectionId?: string; filter?: StudentAssignmentFilter }
  | { kind: "go"; code: string }
  | { kind: "published-site"; host: string; page?: PublicSitePath };

export type ResolvedUrlDestination = {
  href: string;
  audience: "private-workspace" | "public-website" | "revocable-outreach";
  requiresSignIn: boolean;
  description: string;
};

function compactId(id: string): string {
  const uuid = decodeUuidPathParam(id);
  if (!uuid) throw new Error("Expected a canonical resource identifier");
  return encodeUuidForPath(uuid);
}
function safePublishedHost(host: string): string {
  if (host.length > 253 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
      host.split(".").some(part => part.startsWith("-") || part.endsWith("-")))
    throw new Error("Published website host must be a verified DNS hostname");
  return host;
}

/** A centralized URL contract shared by navigation, notifications and copy controls.
 * Domain services still authorize every record independently. */
export function buildUrlDestination(target: UrlDestination): ResolvedUrlDestination {
  const workspace = (href: string): ResolvedUrlDestination => ({
    href, audience: "private-workspace", requiresSignIn: true,
    description: "Requires sign-in and permission for this Site or record.",
  });
  switch (target.kind) {
    case "site-workspace":
    case "site-profile":
    case "site-launch":
    case "site-website": {
      const base = target.identity ? friendlySiteBase(target.identity)
        : "/sites/" + compactId(target.siteId);
      if (target.kind === "site-workspace") return workspace(base);
      if (target.kind === "site-profile") return workspace(base + "/profile");
      if (target.kind === "site-website") return workspace(target.identity
        ? friendlySiteWebsiteHref(target.identity) : "/site-website?siteId=" + compactId(target.siteId));
      if (target.identity) return workspace(friendlySiteLaunchHref(target.identity, target.module));
      const query = new URLSearchParams({ siteId: compactId(target.siteId) });
      if (target.module) query.set("module", target.module);
      return workspace("/launch/site?" + query);
    }
    case "class": return workspace("/class/" + compactId(target.classId));
    case "action": return workspace("/actions/" + compactId(target.actionId));
    case "assignment":
      return workspace(studentAssignmentHref(compactId(target.assessmentId), {
        sectionId: target.sectionId, filter: target.filter,
      }));
    case "go":
      goCodeSchema.parse(target.code);
      return {
        href: "/go/" + target.code, audience: "revocable-outreach", requiresSignIn: false,
        description: "Public navigation only. Can be revoked; does not enroll anyone or grant access.",
      };
    case "published-site": {
      const page = target.page ?? "/";
      if (!isPublicSitePagePath(page)) throw new Error("Unsupported published Site page");
      return {
        href: "https://" + safePublishedHost(target.host) + page,
        audience: "public-website", requiresSignIn: false,
        description: "Public website. Share only after publication is approved.",
      };
    }
  }
}

/** Build an absolute clipboard URL without accepting arbitrary redirects. */
export function absoluteDestinationUrl(
  destination: ResolvedUrlDestination, applicationOrigin: string,
): string {
  if (destination.audience !== "public-website" &&
      (!destination.href.startsWith("/") || destination.href.startsWith("//")))
    throw new Error("Internal destinations must be same-origin relative paths");
  if (destination.audience === "public-website") return destination.href;
  const origin = new URL(applicationOrigin);
  if (origin.protocol !== "https:" &&
      !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
    throw new Error("A secure application origin is required to share URLs");
  return new URL(destination.href, origin.origin).href;
}
