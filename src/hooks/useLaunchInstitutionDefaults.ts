import { useEffect } from "react";
import { suggestedLaunchInstitutions } from "@/domain/launch-institution-defaults";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";

type Options = Awaited<ReturnType<typeof listLaunchOptions>> | null;
export function useLaunchInstitutionDefaults({options,siteId,hostOrganizationId,hostSites,type,creditMode,academicProviderOrganizationId,creditIssuingOrganizationId,jurisdictionId,setHostOrganizationId,setSiteId,setAcademicProviderOrganizationId,setCreditIssuingOrganizationId,setJurisdictionId}:{
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
}) {
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
      setSiteId(hostSites.length === 1 && onlySite ? onlySite.id : "");
      return;
    }
    if (!siteId && hostSites.length === 1 && onlySite) setSiteId(onlySite.id);
  }, [hostSites, hostOrganizationId, siteId]);

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
