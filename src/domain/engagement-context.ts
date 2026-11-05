import { engagementJourneys, type EngagementJourney, type JourneyChoice } from "@/domain/engagement-journeys";

/** Marketing context is narrow and disposable; never use it as authorization
 * or to construct an arbitrary redirect/HTML fragment. */
export type EngagementContext = { campaign?: string; utm_source?: string; partner?: string };
const allowedPartners = ["the-journey-church", "cogic", "cogbf"] as const;
const id = (value: string | null): string | undefined =>
  value && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : undefined;
export function readEngagementContext(search: string): EngagementContext {
  const params = new URLSearchParams(search);
  const partner = params.get("partner");
  return {
    campaign: id(params.get("campaign")),
    utm_source: id(params.get("utm_source")),
    partner: allowedPartners.find(item => item === partner),
  };
}

/** Called with a finite, local path only; no untrusted target URLs or tokens. */
export function engagementLocalHref(path: string, search: string): string {
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path)) {
    throw new Error("Engagement links must remain local paths");
  }
  const context = readEngagementContext(search);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(context)) if (value) params.set(key, value);
  return params.size ? `${path}?${params.toString()}` : path;
}

/** Public CAN Academy currently owns the contact and feedback forms. This
 * cross-app link does not create a CAN OS workflow record. Only fixed, curated
 * next-step options may add query parameters. */
export const publicMarketingOrigin = "https://can-academy.netlify.app";
const categoryAudience = {
  church: "pastor", teacher: "teacher", family: "parent",
  school: "school-leader", network: "denomination",
} as const;

export function engagementContactHref(journey: EngagementJourney, choice: JourneyChoice | undefined, search: string): string {
  if (choice && !journey.next.choices.some(item => item.id === choice.id)) throw new Error("Unknown engagement choice");
  const url = new URL("/contact", publicMarketingOrigin);
  url.searchParams.set("audience", categoryAudience[journey.category]);
  url.searchParams.set("journey", journey.id);
  if (choice) {
    url.searchParams.set("intent", choice.id);
    if (choice.topic) url.searchParams.set("topic", choice.topic);
  }
  for (const [key, value] of Object.entries(readEngagementContext(search))) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function engagementInformationHref(journey: EngagementJourney, choice: JourneyChoice): string {
  if (!journey.next.choices.some(item => item.id === choice.id) ||
      choice.action !== "information" || !choice.href || !/^\/[a-z0-9/-]+$/.test(choice.href)) {
    throw new Error("Unknown information destination");
  }
  return new URL(choice.href, publicMarketingOrigin).toString();
}

/** The front door never grants a school/staff/guardian relationship. */
export function engagementVerifiedRoute(
  journey: EngagementJourney,
  role: string | undefined,
): "/launch/school" | "/launch/family" | "/launch/staff" | null {
  if (!journey.launch) return null;
  const roles = {
    "/launch/school": ["registrar", "site_admin"],
    "/launch/family": ["guardian"],
    "/launch/staff": ["teacher", "site_staff", "site_leader", "room_facilitator", "specialist", "counselor", "paraeducator"],
  } as const;
  return role && roles[journey.launch.path].some(value => value === role) ? journey.launch.path : null;
}

/** No dynamic campaign record is a trusted owner of an application. */
export function getJourneyById(value: string): EngagementJourney | null {
  return Object.prototype.hasOwnProperty.call(engagementJourneys, value)
    ? engagementJourneys[value as keyof typeof engagementJourneys]
    : null;
}

/** Public pre-launch and follow-up pages share presentation, never workspace chrome. */
export function isEngagementPath(pathname: string): boolean {
  const path = pathname.replace(/\/$/, "");
  return path === "/landing" || path.startsWith("/landing/") || path.startsWith("/next/");
}
