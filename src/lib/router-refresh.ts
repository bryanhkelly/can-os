import { DomainError } from "@/domain/errors";

type RefreshMatch = {
  id: string;
  status: string;
  loaderData?: unknown;
};

export function hasFailedRead(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  if ("ok" in value && value.ok === false) return true;
  if ("isError" in value && value.isError === true) return true;
  if ("connected" in value && value.connected === false) return true;
  if ("data" in value && (("ok" in value && value.ok === true) ||
      ("isError" in value && value.isError === false))) return hasFailedRead(value.data);
  return "session" in value && "error" in value && value.error !== null;
}

export function assertRefreshResult(value: unknown) {
  if (hasFailedRead(value)) {
    throw new DomainError("UNAVAILABLE", "The refreshed read did not return usable data");
  }
}

export function assertRouterRefresh(matches: readonly RefreshMatch[]) {
  if (matches.some(match => match.status !== "success" || hasFailedRead(match.loaderData))) {
    throw new DomainError("UNAVAILABLE", "The refreshed route did not return usable data");
  }
}

export async function invalidateRouterAndCheck(router: {
  invalidate: () => Promise<unknown>;
  state: { matches: readonly RefreshMatch[] };
}) {
  await router.invalidate();
  assertRouterRefresh(router.state.matches);
}
