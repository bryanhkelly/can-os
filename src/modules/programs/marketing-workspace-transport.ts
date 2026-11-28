import type {z} from "zod";
import * as packages from "./site-marketing-packages-v61.functions";
import * as artifacts from "./site-marketing-artifacts.functions";
import type * as p from "./site-marketing-packages-v61.inputs";
import type * as a from "./site-marketing-artifacts.inputs";
import {legacyEngagementTransport,type EngagementWorkspaceTransport} from "@/modules/engagement/engagement-workspace-transport";
type Data<T>={data:T};
export interface MarketingWorkspaceApi{
 readSiteMarketingSuggestionsV61(input:Data<z.input<typeof p.siteInput>>):ReturnType<typeof packages.readSiteMarketingSuggestionsV61>;
 createSiteMarketingPackageV61(input:Data<z.input<typeof p.createInput>>):ReturnType<typeof packages.createSiteMarketingPackageV61>;
 saveSiteMarketingPackageV61(input:Data<z.input<typeof p.saveInput>>):ReturnType<typeof packages.saveSiteMarketingPackageV61>;
 duplicateSiteMarketingPackageV61(input:Data<z.input<typeof p.recordInput>>):ReturnType<typeof packages.duplicateSiteMarketingPackageV61>;
 archiveSiteMarketingPackageV61(input:Data<z.input<typeof p.archiveInput>>):ReturnType<typeof packages.archiveSiteMarketingPackageV61>;
 selectSiteMarketingPackageBrandV61(input:Data<z.input<typeof p.brandInput>>):ReturnType<typeof packages.selectSiteMarketingPackageBrandV61>;
 deleteSiteMarketingPackageV61(input:Data<z.input<typeof p.revisionInput>>):ReturnType<typeof packages.deleteSiteMarketingPackageV61>;
 previewSiteMarketingArtifact(input:Data<z.input<typeof a.previewInputSchema>>):ReturnType<typeof artifacts.previewSiteMarketingArtifact>;
 createSiteMarketingPackageRelease(input:Data<z.input<typeof a.packageReleaseInput>>):ReturnType<typeof artifacts.createSiteMarketingPackageRelease>;
 listSiteMarketingPackageReleases(input:Data<z.input<typeof a.scope>>):ReturnType<typeof artifacts.listSiteMarketingPackageReleases>;
 listSiteMarketingReleases(input:Data<z.input<typeof a.scope>>):ReturnType<typeof artifacts.listSiteMarketingReleases>;
 getSiteMarketingReleaseOutput(input:Data<z.input<typeof a.releaseSchema>>):ReturnType<typeof artifacts.getSiteMarketingReleaseOutput>;
 withdrawSiteMarketingRelease(input:Data<z.input<typeof a.withdrawInput>>):ReturnType<typeof artifacts.withdrawSiteMarketingRelease>;
}
export type MarketingWorkspaceTransport={kind:"legacy"|"nest";api:MarketingWorkspaceApi;engagement:EngagementWorkspaceTransport};
export const legacyMarketingTransport:MarketingWorkspaceTransport={kind:"legacy",api:{...packages,...artifacts},engagement:legacyEngagementTransport};
