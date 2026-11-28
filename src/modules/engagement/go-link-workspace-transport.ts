import * as legacy from "./site-go-links.functions";
import type {GoDestination,GoDestinationChoice} from "@/domain/site-go-links";
import type {GoLinkChannel} from "@/domain/go-link-policy";
type Scope={siteId:string;packageId?:string};
type LinkScope=Scope&{linkId:string};
type Data<T>={data:T};
/** Workspace port deliberately excludes issuing website preview snapshots. */
export interface GoLinkWorkspaceApi{
 listSiteGoLinksPage(input:Data<Scope&{limit?:number;cursor?:string;term?:string}>):ReturnType<typeof legacy.listSiteGoLinksPage>;
 listAvailableGoDestinations(input:Data<Scope&{kind:GoDestination["kind"];term?:string}>):Promise<readonly GoDestinationChoice[]>;
 createSiteGoLink(input:Data<Scope&{requestId:string;destination:Exclude<GoDestination,{kind:"website-preview"}>;management?:{name:string;channel?:GoLinkChannel|null;startsAt?:string|null;expiresAt?:string|null}}>):Promise<unknown>;
 inspectSavedGoLink(input:Data<LinkScope>):ReturnType<typeof legacy.inspectSavedGoLink>;
 setSiteGoLinkPaused(input:Data<LinkScope&{action:"pause"|"resume"}>):Promise<unknown>;
 revokeSiteGoLink(input:Data<LinkScope>):Promise<unknown>;
}
export type GoLinkWorkspaceTransport={kind:"legacy"|"nest";api:GoLinkWorkspaceApi};
export const legacyGoLinkTransport:GoLinkWorkspaceTransport={kind:"legacy",api:legacy};
