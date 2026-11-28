import { createContext, useContext, useState, type ReactNode } from "react";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";

const FixtureContent = createContext<ReactNode>(null);
function FixtureRoot() {
  return <>{useContext(FixtureContent)}</>;
}

/**
 * Each mounted story owns one memory router. Updating story args or controls
 * updates the content without replacing navigation state. Never imports the
 * application route tree, authentication, loaders, or server functions.
 * For stories testing real route transitions, keep explicit fixture routes.
 */
export function FixtureRouter({ initialPath = "/", children }: {
  initialPath?: string;
  children: ReactNode;
}) {
  const [router] = useState(() => createRouter({
    routeTree: createRootRoute({ component: FixtureRoot }),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  }));
  return <FixtureContent.Provider value={children}>
    <RouterProvider router={router} />
  </FixtureContent.Provider>;
}
