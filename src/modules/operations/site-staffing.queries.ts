import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { getLocalSiteDelegations } from "./site-local-delegation.functions";
import { getSectionFacilitatorPlanning } from "./site-section-facilitators.functions";

/** Related client read models, not new permissions or a staffing record store. */
export const siteStaffingKeys = {
  program: (programId: string) => ["site-staffing", programId] as const,
  localDelegations: (programId: string) =>
    [...siteStaffingKeys.program(programId), "local-delegations"] as const,
  sectionFacilitators: (programId: string) =>
    [...siteStaffingKeys.program(programId), "section-facilitators"] as const,
};

export function localSiteDelegationsQuery(programId: string) {
  return queryOptions({
    queryKey: siteStaffingKeys.localDelegations(programId),
    queryFn: () => getLocalSiteDelegations({ data: { programId } }),
    retry: false,
    gcTime: 0,
  });
}

export function sectionFacilitatorsQuery(programId: string) {
  return queryOptions({
    queryKey: siteStaffingKeys.sectionFacilitators(programId),
    queryFn: () => getSectionFacilitatorPlanning({ data: { programId } }),
    retry: false,
    gcTime: 0,
  });
}

export function refreshSiteStaffing(client: QueryClient, programId: string) {
  return client.invalidateQueries(
    { queryKey: siteStaffingKeys.program(programId) },
    { throwOnError: true },
  );
}

/** A saved command is not failed just because a subsequent read is unavailable.
 * Both appointment projections are refreshed: the first director appointment
 * creates the planning configuration required by Section facilitator planning.
 * Authorization, expected-assignment checks and evidence remain server-owned.
 */
export function siteStaffingMutationOptions<Input, Result>(
  client: QueryClient,
  programId: string,
  command: (input: Input) => Promise<Result>,
) {
  return mutationOptions({
    mutationKey: siteStaffingKeys.program(programId),
    retry: false,
    mutationFn: async (input: Input) => {
      const result = await command(input);
      let refreshWarning: string | null = null;
      try {
        await refreshSiteStaffing(client, programId);
      } catch {
        refreshWarning = "Your change was saved, but the latest staffing records could not be loaded. Retry loading before making another change.";
      }
      return { result, refreshWarning };
    },
  });
}
