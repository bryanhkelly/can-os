import type { MarketingFormat } from "./marketing-package-v61";

/** Single source of truth for the original output template revisions.
 * A template bump changes the entire Marketing Package's release freshness. */
export const siteMarketingTemplateVersions={
  email:1,
  flyer:2,
  social:2,
  handout:2,
  "qr-card":1,
} as const satisfies Record<MarketingFormat,number>;
