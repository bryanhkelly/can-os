/** Pure, fail-closed annual curriculum license and adoption policy. */
export type CurriculumYearScope = {
  organizationId:string; programId:string; siteId:string|null;
  academicProviderOrganizationId:string; academicYearId:string;
};
export type AnnualLicense = {
  organizationId:string; packId:string; status:string; startsAt:Date|null; endsAt:Date|null;
  withdrawnAt:Date|null; publisherOrganizationId:string;
};
export type AnnualAdoption = CurriculumYearScope & {
  packId:string; packVersionId:string; status:string; supersededAt:Date|null;
};
export function licenseValidForYear(license:AnnualLicense, period:{startsAt:Date;endsAt:Date}, now:Date):boolean {
  return license.status==="active" && !license.withdrawnAt &&
    license.startsAt!==null && license.endsAt!==null &&
    license.startsAt<=period.startsAt &&
    license.endsAt>=period.endsAt &&
    license.startsAt<=now &&
    license.endsAt>=now;
}
/** Adoption alone is never an authorization to use publisher content. */
export function annualAdoptionEligible(input:{
  scope:CurriculumYearScope;adoption:AnnualAdoption;license:AnnualLicense;
  year:{startsAt:Date;endsAt:Date};now:Date;packVersionPublished:boolean;
}):boolean {
  const {scope,adoption,license,year,now,packVersionPublished}=input;
  return packVersionPublished && adoption.status==="active" && !adoption.supersededAt &&
    adoption.organizationId===scope.organizationId && adoption.programId===scope.programId &&
    adoption.siteId===scope.siteId && adoption.academicProviderOrganizationId===scope.academicProviderOrganizationId &&
    adoption.academicYearId===scope.academicYearId &&
    adoption.packId===license.packId && license.organizationId===scope.organizationId &&
    licenseValidForYear(license,year,now);
}
