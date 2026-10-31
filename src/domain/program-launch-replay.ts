type LaunchIntent = {
  name: string;
  type: string;
  hostOrganizationId?: string | null;
  siteId?: string | null;
  jurisdictionId: string;
  academicProviderOrganizationId: string;
  creditIssuingOrganizationId?: string | null;
  accreditationAuthorityOrganizationId?: string | null;
  creditMode?: string;
  targetOpeningDate?: string;
  gradeRange: { min: string; max: string };
  deliveryModel: {
    onsite?: boolean; asynchronous?: boolean; liveOnline?: boolean; onsiteDaysPerWeek?: number;
  };
};

/** Compare the persisted proposal, not just a guessed slug. No access is granted here. */
export function matchesProgramLaunchReplay(saved: LaunchIntent, proposed: LaunchIntent): boolean {
  function normalized(value: LaunchIntent) {
    return [
      value.name, value.type, value.hostOrganizationId ?? null, value.siteId ?? null,
      value.jurisdictionId, value.academicProviderOrganizationId,
      value.creditIssuingOrganizationId ?? null, value.accreditationAuthorityOrganizationId ?? null,
      value.creditMode, value.targetOpeningDate ?? null,
      value.gradeRange.min, value.gradeRange.max,
      Boolean(value.deliveryModel.onsite), Boolean(value.deliveryModel.asynchronous),
      Boolean(value.deliveryModel.liveOnline), value.deliveryModel.onsiteDaysPerWeek ?? null,
    ];
  }
  return JSON.stringify(normalized(saved)) === JSON.stringify(normalized(proposed));
}

