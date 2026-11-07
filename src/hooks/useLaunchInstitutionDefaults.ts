import { useEffect, useRef } from "react";
import { addressStateJurisdiction, siteJurisdictionLocation } from "@/domain/site-jurisdiction-default";
import { suggestedLaunchInstitutions } from "@/domain/launch-institution-defaults";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";

type Options = Awaited<ReturnType<typeof listLaunchOptions>> | null;
export function useLaunchInstitutionDefaults({options,siteId,hostOrganizationId,hostSites,type,creditMode,academicProviderOrganizationId,creditIssuingOrganizationId,jurisdictionId,setHostOrganizationId,setSiteId,setAcademicProviderOrganizationId,setCreditIssuingOrganizationId,setJurisdictionId,strictSelection}:{
 options:Options;
 siteId:string;
 hostOrganizationId:string;
 hostSites:NonNullable<Options>["sites"];
 type:Parameters<typeof suggestedLaunchInstitutions>[0]["type"];
 creditMode:"credit_bearing"|"non_credit";
 academicProviderOrganizationId:string;
 creditIssuingOrganizationId:string;
 jurisdictionId:string;
 setHostOrganizationId:(value:string)=>void;
 setSiteId:(value:string)=>void;
 setAcademicProviderOrganizationId:(value:string)=>void;
 setCreditIssuingOrganizationId:(value:string)=>void;
 setJurisdictionId:(value:string)=>void;
 strictSelection?:boolean;
}) {
  // When an address-backed Site is selected, use its state for initial guidance.
  // A registrar may correct it manually. Do not reapply a default on every render.
  const previousLocationRevision=useRef<string | null>(null);
  const lastAutoJurisdictionId=useRef<string | null>(null);
  useEffect(() => {
    if (!options) return;
    const site=options.sites.find(item => item.id===siteId);
    const revision=site?`${site.id}:${site.updatedAt}:${site.planningLocation?.state??""}`:"";
    if(previousLocationRevision.current===revision)return;
    previousLocationRevision.current=revision;
    const previouslyAutomatic=lastAutoJurisdictionId.current;
    const location=siteJurisdictionLocation(site?.address,site?.planningLocation);
    const matching=addressStateJurisdiction(location,options.jurisdictions);
    // Never override the registrar's manually selected jurisdiction.
    if(matching && (!jurisdictionId || jurisdictionId===previouslyAutomatic)){
      lastAutoJurisdictionId.current=matching;
      setJurisdictionId(matching);
    }else if(previouslyAutomatic && jurisdictionId===previouslyAutomatic){
      lastAutoJurisdictionId.current=null;
      setJurisdictionId("");
    }
  },[options,siteId,jurisdictionId,setJurisdictionId]);
  // Turnkey defaults: when the registrar grant covers exactly one church, and
  // that church has exactly one Site, preselect both instead of asking the
  // leader to find records the system already knows. Selections stay editable.
  useEffect(() => {
    if (!options) return;
    const selectedSite = options.sites.find(site => site.id === siteId);
    if (!hostOrganizationId && selectedSite) {
      setHostOrganizationId(selectedSite.organizationId);
      return;
    }
    const [onlyOrganization] = options.organizations;
    if (!hostOrganizationId && options.organizations.length === 1 && onlyOrganization) {
      setHostOrganizationId(onlyOrganization.id);
    }
  }, [options, hostOrganizationId, siteId]);
  useEffect(() => {
    const [onlySite] = hostSites;
    if (!hostOrganizationId) return;
    // Never carry a campus from a different host into a new launch.
    if (siteId && !hostSites.some(site => site.id === siteId)) {
      // Explicit URLs must be rejected by the page, never rebound to a sibling Site.
      if (strictSelection) return;
      setSiteId(hostSites.length === 1 && onlySite ? onlySite.id : "");
      return;
    }
    if (!siteId && !strictSelection && hostSites.length === 1 && onlySite) setSiteId(onlySite.id);
  }, [hostSites, hostOrganizationId, siteId, strictSelection]);

  useEffect(() => {
    if (!options) return;
    const suggested = suggestedLaunchInstitutions({
      type, creditMode, providers: options.academicProviderOrganizations,
      issuers: options.creditIssuingOrganizations,
      selectedProviderId: academicProviderOrganizationId,
    });
    if (!academicProviderOrganizationId && suggested.providerId)
      setAcademicProviderOrganizationId(suggested.providerId);
    if (!creditIssuingOrganizationId && suggested.issuerId)
      setCreditIssuingOrganizationId(suggested.issuerId);
    if (!jurisdictionId && options.jurisdictions.length === 1)
      setJurisdictionId(options.jurisdictions[0]!.id);
  }, [options, type, creditMode, academicProviderOrganizationId, creditIssuingOrganizationId, jurisdictionId]);

}
