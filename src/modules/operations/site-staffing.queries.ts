import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { getLocalSiteDelegations } from "./site-local-delegation.functions";
import { getSectionFacilitatorPlanning } from "./site-section-facilitators.functions";
import { createMutationRunner } from "@/lib/mutation-feedback";
import { DomainError } from "@/domain/errors";

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

function invalidateSiteStaffing(client: QueryClient, programId: string) {
  return client.invalidateQueries(
    { queryKey: siteStaffingKeys.program(programId) },
    { throwOnError: true },
  );
}

const runners = new WeakMap<QueryClient, Map<string, ReturnType<typeof createMutationRunner>>>();
function staffingRunner(client: QueryClient, programId: string) {
  let programs = runners.get(client);
  if (!programs) { programs = new Map(); runners.set(client, programs); }
  let runner = programs.get(programId);
  if (!runner) {
    runner = createMutationRunner({
      refresh: () => invalidateSiteStaffing(client, programId),
      update: () => {},
    });
    programs.set(programId, runner);
  }
  return runner;
}

export async function refreshSiteStaffing(client: QueryClient, programId: string) {
  const result = await staffingRunner(client, programId).retryRefresh();
  if (result.status === "not-required") await invalidateSiteStaffing(client, programId);
  if (result.status === "refresh-failed") throw new DomainError("UNAVAILABLE");
  if (result.status === "duplicate") throw new DomainError("CONFLICT");
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
      const refreshWarning = "Your change was saved, but the latest staffing records could not be loaded. Retry loading before making another change.";
      const outcome = await staffingRunner(client, programId)(() => command(input), {
        successMessage: "", commandErrorMessage: "Unable to update staffing.", refreshErrorMessage: refreshWarning,
      });
      if (outcome.status === "failed") throw outcome.error;
      if (outcome.status === "duplicate" || outcome.status === "refresh-required") throw new DomainError("CONFLICT");
      return { result: outcome.value, refreshWarning: outcome.status === "refresh-failed" ? refreshWarning : null };
    },
  });
}
