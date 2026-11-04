import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { assertRouterRefresh } from "./lib/router-refresh";
import { AccessReturnError, AccessReturnNotFound } from "./lib/access-return-recovery";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultErrorComponent: AccessReturnError,
    defaultNotFoundComponent: AccessReturnNotFound,
    scrollRestoration: true,
    defaultPendingComponent: () => <main role="status" className="p-6" aria-label="Loading page">Loading page...</main>,
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
