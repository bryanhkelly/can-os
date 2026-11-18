/**
 * Both /class and Launch Studio read the same authorized operator Class list.
 * Cache the exact Site-filtered result under one key; a mutation invalidates
 * the shared root so either workspace refetches its own authorized scope.
 * This is presentation cache coordination, never an authorization grant.
 */
const root = "native-class-operator-classes" as const;

export const nativeClassOperatorQueryKeys = {
  root: [root] as const,
  site: (siteId?: string | null) => [root, siteId ?? null] as const,
};
