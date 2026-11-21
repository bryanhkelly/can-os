import type { MarketingPurpose } from "./marketing-package-v61";

/**
 * Three Introduce destinations, one existing Site-scoped Marketing Package
 * source. This is presentation and navigation configuration, not persisted
 * campaign, contact, enrollment, event, or Brand state.
 */
export const introduceModuleIdsV61 = ["promote", "recruit", "interest-events"] as const;
export type IntroduceModuleV61 = (typeof introduceModuleIdsV61)[number];

type IntroduceHandoff = {
  title: string;
  description: string;
  href: (siteId: string) => string;
};

type IntroduceConfig = {
  title: string;
  eyebrow: string;
  subtitle: string;
  libraryTitle: string;
  libraryDescription: string;
  guidance: string;
  defaultPurpose: MarketingPurpose;
  purposes: readonly MarketingPurpose[];
  handoffDescription: string;
  handoffs: readonly IntroduceHandoff[];
  /** Optional handoff for one reviewed, saved, active Package. Navigation
   * carries a reference to the canonical record, not a copy of its message. */
  packageHandoff?: Omit<IntroduceHandoff,"href"> & {
    purpose: MarketingPurpose;
    href: (siteId:string,packageId:string)=>string;
  };
};

const scoped = (siteId: string) => encodeURIComponent(siteId);

export const introduceModuleConfigV61: Record<IntroduceModuleV61, IntroduceConfig> = {
  promote: {
    title: "Promote",
    eyebrow: "Introduce / Promote",
    subtitle: "Create messages and promotional materials.",
    libraryTitle: "Marketing Packages",
    libraryDescription: "Create announcements and invitations.",
    guidance: "Start with your saved Site information and edit the message.",
    defaultPurpose: "site-announcement",
    purposes: ["site-announcement", "program-interest", "interest-invitation", "event-invitation"],
    handoffDescription: "Reuse your messages in other activities.",
    handoffs: [
      { title: "Recruit Families / Learners",
        description: "Invite people to learn about your Site.",
        href: id => `/launch/site?siteId=${scoped(id)}&module=recruit` },
      { title: "Interest Events",
        description: "Create invitations for upcoming events.",
        href: id => `/launch/site?siteId=${scoped(id)}&module=interest-events` },
    ],
  },
  recruit: {
    title: "Recruit Families / Learners",
    eyebrow: "Introduce / Recruit Families / Learners",
    subtitle: "Invite families and learners to learn more.",
    libraryTitle: "Recruitment Messages & Materials",
    libraryDescription: "Create invitations and messages for prospective learners.",
    guidance: "Create messages and collect interest from prospective learners.",
    defaultPurpose: "interest-invitation",
    purposes: ["interest-invitation", "program-interest"],
    handoffDescription: "Manage inquiries and follow up with interested families.",
    handoffs: [
      { title: "Review website interest and follow-up",
        description: "View and respond to inquiries.",
        href: id => `/admissions/intake?siteId=${scoped(id)}` },
      { title: "Invite families to express interest",
        description: "Invite families to express interest.",
        href: id => `/admissions/invite-families?siteId=${scoped(id)}&purpose=interest` },
    ],
    packageHandoff: {
      purpose: "interest-invitation",
      title: "Invite families with this saved message",
      description: "Use this message in a family invitation.",
      href: (siteId,packageId)=>`/admissions/invite-families?siteId=${scoped(siteId)}&purpose=interest&packageId=${scoped(packageId)}`,
    },
  },
  "interest-events": {
    title: "Interest Events",
    eyebrow: "Introduce / Interest Events",
    subtitle: "Create invitations and manage information sessions.",
    libraryTitle: "Event Messages & Materials",
    libraryDescription: "Create materials for your events.",
    guidance: "Create an invitation, then set up the event separately.",
    defaultPurpose: "event-invitation",
    purposes: ["event-invitation"],
    handoffDescription: "Manage events connected to your Programs.",
    handoffs: [
      { title: "Manage Interest Events",
        description: "Create and manage events.",
        href: id => `/operations/interest-events?siteId=${scoped(id)}` },
    ],
    packageHandoff: {
      purpose: "event-invitation",
      title: "Create an Interest Event",
      description: "Use this invitation to start an event.",
      href: (siteId,packageId)=>`/operations/interest-events/new?siteId=${scoped(siteId)}&packageId=${scoped(packageId)}`,
    },
  },
};

export function isIntroduceModuleV61(value: string | undefined): value is IntroduceModuleV61 {
  return value === "promote" || value === "recruit" || value === "interest-events";
}
