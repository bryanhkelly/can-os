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
  packageHandoff?: IntroduceHandoff & {
    purpose: MarketingPurpose;
    href: (siteId:string,packageId:string)=>string;
  };
};

const scoped = (siteId: string) => encodeURIComponent(siteId);

export const introduceModuleConfigV61: Record<IntroduceModuleV61, IntroduceConfig> = {
  promote: {
    title: "Promote",
    eyebrow: "Introduce / Promote",
    subtitle: "Create reviewed messages and branded materials for your learning community.",
    libraryTitle: "Marketing Packages",
    libraryDescription: "Build reusable announcements, program ideas and invitations from your saved Site information.",
    guidance: "Uses the Site's saved Purpose & Story, Programs & Audiences and the selected immutable Brand version. Review the copy before generating any material.",
    defaultPurpose: "site-announcement",
    purposes: ["site-announcement", "program-interest", "interest-invitation", "event-invitation"],
    handoffDescription: "Use the same packages in the other Introduce modules, without copying or recreating them.",
    handoffs: [
      { title: "Recruit Families / Learners",
        description: "Prepare interest outreach with the same saved Site identity and messages.",
        href: id => `/launch/site?siteId=${scoped(id)}&module=recruit` },
      { title: "Interest Events",
        description: "Prepare event invitations and continue to the authorized event workspace.",
        href: id => `/launch/site?siteId=${scoped(id)}&module=interest-events` },
    ],
  },
  recruit: {
    title: "Recruit Families / Learners",
    eyebrow: "Introduce / Recruit Families / Learners",
    subtitle: "Invite people into the conversation before applications and enrollment.",
    libraryTitle: "Recruitment Messages & Materials",
    libraryDescription: "Prepare interest invitations and planned-program messages using the existing Site Marketing Packages.",
    guidance: "Planned learning interests are not approved Offerings. No contacts, submissions, application invitations or email sends are created by these materials.",
    defaultPurpose: "interest-invitation",
    purposes: ["interest-invitation", "program-interest"],
    handoffDescription: "Preopening interest outreach is a separate, permission-checked workflow for eligible developing Programs. Applications and enrollment require their own authority. A Site-wide prospect CRM is not implemented.",
    handoffs: [
      { title: "Invite families to express interest",
        description: "Use the existing consent-aware preopening interest workflow when an eligible Program exists.",
        href: id => `/admissions/invite-families?siteId=${scoped(id)}&purpose=interest` },
    ],
    packageHandoff: {
      purpose: "interest-invitation",
      title: "Invite families with this saved message",
      description: "Reuse the package headline and introduction in the existing consent-aware outreach form. Recipient contacts and delivery consent are never copied from a Marketing Package.",
      href: (siteId,packageId)=>`/admissions/invite-families?siteId=${scoped(siteId)}&purpose=interest&packageId=${scoped(packageId)}`,
    },
  },
  "interest-events": {
    title: "Interest Events",
    eyebrow: "Introduce / Interest Events",
    subtitle: "Prepare event invitations and manage real information sessions or open houses.",
    libraryTitle: "Event Messages & Materials",
    libraryDescription: "Create event invitation collateral using the same saved Site Brand and planning information.",
    guidance: "Invitation wording is a private draft until reviewed and distributed. It does not create an event, invent a date, or register attendees.",
    defaultPurpose: "event-invitation",
    purposes: ["event-invitation"],
    handoffDescription: "The existing event service supports authorized, Program-linked events and registrations. It is not yet a pre-Program Site-wide event builder.",
    handoffs: [
      { title: "Manage Interest Events",
        description: "Create or manage verified events for this Site in the existing workspace.",
        href: id => `/operations/interest-events?siteId=${scoped(id)}` },
    ],
    packageHandoff: {
      purpose: "event-invitation",
      title: "Create an Interest Event",
      description: "Use the saved invitation headline as a starting title. Confirm the Program, date, time, location and description in the separately authorized event workspace.",
      href: (siteId,packageId)=>`/operations/interest-events/new?siteId=${scoped(siteId)}&packageId=${scoped(packageId)}`,
    },
  },
};

export function isIntroduceModuleV61(value: string | undefined): value is IntroduceModuleV61 {
  return value === "promote" || value === "recruit" || value === "interest-events";
}
