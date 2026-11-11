type Organization = { id: string; type: string };
/** Suggested intent only. Agreement services and opening remain server-owned. */
export function suggestedLaunchInstitutions(input: {
  type: string;
  creditMode: "credit_bearing" | "non_credit";
  providers: Organization[];
  issuers: Organization[];
  selectedProviderId: string;
}): { providerId?: string; issuerId?: string } {
  const canProviders = input.providers.filter(org => org.type === "can_network");
  const providerId = input.selectedProviderId || (
    input.type === "church_hosted_academy" && canProviders.length === 1
      ? canProviders[0]?.id
      : input.providers.length === 1 ? input.providers[0]?.id : undefined
  );
  const issuerId = input.creditMode === "non_credit" ? undefined :
    input.type === "church_hosted_academy" && providerId
      ? input.issuers.find(org => org.id === providerId)?.id
      : input.issuers.length === 1 ? input.issuers[0]?.id : undefined;
  return { providerId, issuerId };
}

