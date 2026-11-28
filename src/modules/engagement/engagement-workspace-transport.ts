import * as legacy from "./engagement-registry.functions";
import {legacyGoLinkTransport,type GoLinkWorkspaceTransport} from "./go-link-workspace-transport";
import {legacyCampaignTransport} from "@/modules/communication/campaign-workspace-transport";
import type {CampaignTransport} from "@/domain/campaign-workspace-api";
import type {EngagementOwner,EngagementDefinition,EngagementChannel} from "@/domain/engagement-definition";
import type {GoDestinationChoice} from "@/domain/site-go-links";
type Data<T>={data:T};
type Owner=Extract<EngagementOwner,{kind:"platform"|"organization"}>;
type Scope={engagementId:string};
export interface EngagementRegistryApi{
 createEngagementDefinition(input:Data<{owner:EngagementOwner;definition:EngagementDefinition}>):ReturnType<typeof legacy.createEngagementDefinition>;
 createEngagementGoLink(input:Data<Scope&{versionId:string;channel?:EngagementChannel}>):ReturnType<typeof legacy.createEngagementGoLink>;
 listEngagementGoLinks(input:Data<Scope>):ReturnType<typeof legacy.listEngagementGoLinks>;
 retireEngagementDefinition(input:Data<Scope>):Promise<unknown>;
 revokeEngagementGoLink(input:Data<Scope&{linkId:string}>):Promise<unknown>;
 listSiteEngagementDefinitions(input:Data<{siteId:string;packageId:string}>):ReturnType<typeof legacy.listSiteEngagementDefinitions>;
 listOwnerEngagementDefinitions(input:Data<{owner:Owner}>):ReturnType<typeof legacy.listOwnerEngagementDefinitions>;
 listOwnerEngagementDestinations(input:Data<{owner:Owner;kind:"information"|"adult-training";siteId?:string;term?:string}>):Promise<readonly GoDestinationChoice[]>;
}
export type EngagementWorkspaceTransport={kind:"legacy"|"nest";api:EngagementRegistryApi;go:GoLinkWorkspaceTransport;campaign:CampaignTransport};
export const legacyEngagementTransport:EngagementWorkspaceTransport={kind:"legacy",api:legacy,go:legacyGoLinkTransport,campaign:legacyCampaignTransport};
