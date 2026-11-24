/** Current delivery-cohort metrics, not person reach or historical outcomes.
 * Acceptance is an overlapping milestone; other states are current outcomes.
 * Do not sum accepted and delivered, or count recipients across campaigns as people. */
export const CAMPAIGN_METRIC_VERSION="1.0.0" as const;
export const CAMPAIGN_METRIC_DEFINITIONS=[
 {key:"total",label:"Recipient deliveries created",rule:"Count exact campaign delivery rows, including suppressed recipients"},
 {key:"pending",label:"Pending deliveries",rule:"Count pending or processing delivery rows"},
 {key:"accepted",label:"Provider accepted",rule:"Count delivery rows with an acceptance timestamp; includes later bounces, complaints and deliveries"},
 {key:"delivered",label:"Confirmed delivered",rule:"Count delivery rows with a delivery receipt and no recorded provider failure"},
 {key:"bounced",label:"Bounced",rule:"Count delivery rows with current provider failure email.bounced"},
 {key:"complained",label:"Complaints",rule:"Count delivery rows with current provider failure email.complained"},
 {key:"failed",label:"Confirmed failed",rule:"Count definite terminal local failures or current provider failure email.failed"},
 {key:"unconfirmed",label:"Unconfirmed outcome",rule:"Count terminal local failures whose send outcome is unconfirmed"},
 {key:"suppressed",label:"Suppressed",rule:"Count local suppression or current provider failure email.suppressed"},
 {key:"cancelled",label:"Cancelled",rule:"Count cancelled delivery rows"},
].map(def=>({...def,source:"public.campaign_deliveries",denominator:"Exact campaign delivery rows; not distinct people or confirmed human reach",timeBasis:"Current recorded state of campaigns created in the selected cohort; not historical as-of event totals"}));
export type CampaignMetricKey="total"|"pending"|"accepted"|"delivered"|"bounced"|"complained"|"failed"|"unconfirmed"|"suppressed"|"cancelled";
export type CampaignDeliveryMetrics=Record<CampaignMetricKey,number>;
