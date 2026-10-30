import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPendingComponent: () => <main role="status" className="p-6" aria-label="Loading page">Loading page...</main>,
    defaultPendingMs: 150,
    defaultPendingMinMs: 0,
    defaultPreloadStaleTime: 0,
  });
};
