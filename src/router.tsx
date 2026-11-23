import { QueryClient } from "@tanstack/react-query";
import { createRouter, parseSearchWith, stringifySearchWith } from "@tanstack/react-router";
import { compactUuidSearchSelections, expandUuidSearchSelections } from "@/domain/compact-url-search";
import { routeTree } from "./routeTree.gen";
import { assertRouterRefresh } from "./lib/router-refresh";
import { AccessReturnError, AccessReturnNotFound } from "./lib/access-return-recovery";
import { PageFrame } from "@/components/workspace";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const parseDefaultSearch = parseSearchWith(JSON.parse);
  const stringifyDefaultSearch = stringifySearchWith(JSON.stringify);

  const router = createRouter({
    routeTree,
    parseSearch: query => expandUuidSearchSelections(parseDefaultSearch(query)),
    stringifySearch: search => stringifyDefaultSearch(compactUuidSearchSelections(search)),
    context: { queryClient },
    defaultErrorComponent: AccessReturnError,
    defaultNotFoundComponent: AccessReturnNotFound,
    scrollRestoration: true,
    defaultPendingComponent: () => <PageFrame role="status" aria-label="Loading page">Loading page...</PageFrame>,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    defaultPreloadStaleTime: 0,
  });
  const invalidate = router.invalidate;
  router.invalidate = async options => {
    await invalidate(options);
    assertRouterRefresh(router.state.matches);
  };
  return router;
};
