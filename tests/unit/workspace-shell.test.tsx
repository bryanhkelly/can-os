import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory, createRootRoute, createRoute, createRouter,
  Link, Outlet, RouterProvider,
} from "@tanstack/react-router";
import { WorkspaceNavigation } from "@/components/shell/WorkspaceNavigation";
import { WorkspaceSessionProvider, workspaceSessionIdentity, workspaceSessionQueryOptions } from "@/components/shell/WorkspaceSession";
import { CommandPalette } from "@/components/shell/CommandPalette";
import type { WorkspaceSessionResult } from "@/modules/identity/workspace-session.functions";

const state = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/modules/identity/workspace-session.functions", () => ({ getWorkspaceSession: state.read }));
vi.mock("@/modules/search/global-search.functions", () => ({ searchWorkspace: vi.fn() }));

const signedOut: WorkspaceSessionResult = { session: { authenticated: false }, error: null };
const signedIn: WorkspaceSessionResult = {
  session: {
    authenticated: true, activeGrantId: "student-grant", role: "student",
    grants: [{
      id: "student-grant", personId: "person", role: "student", firstName: "Test", lastName: "Learner",
      organizationId: "org", siteId: "site",
    }],
    sites: [{ id: "site", name: "Test School", organizationId: "org" }],
    programs: [{ id: "program", name: "Program", siteId: "site" }],
    activeContext: { organizationIds: ["org"], siteIds: ["site"], programIds: ["program"] },
  },
  error: null,
};

async function shell(initial: WorkspaceSessionResult) {
  const queryClient = new QueryClient();
  state.read.mockResolvedValue(initial);
  const root = createRootRoute({
    loader: () => queryClient.fetchQuery(workspaceSessionQueryOptions()),
    staleTime: Infinity,
    component: () => <QueryClientProvider client={queryClient}>
      <WorkspaceSessionProvider initial={root.useLoaderData()}>
        <WorkspaceNavigation><Outlet /></WorkspaceNavigation>
        <CommandPalette />
      </WorkspaceSessionProvider>
    </QueryClientProvider>,
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <p>Home</p> });
  const student = createRoute({
    getParentRoute: () => root, path: "/student", component: () =>
      <Link to="/messages" search={{ thread: "test thread" }} hash="reply">Open conversation</Link>,
  });
  const messages = createRoute({
    getParentRoute: () => root, path: "/messages",
    validateSearch: (search: Record<string, unknown>) => ({ thread: String(search.thread ?? "") }),
    component: () => <p>Messages</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, student, messages]),
    history: createMemoryHistory({ initialEntries: ["/student"] }),
  });
  await router.load();
  return {
    router, queryClient,
    markup: () => renderToStaticMarkup(<RouterProvider router={router} />),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("persistent server-initialized workspace shell", () => {
  it("renders the verified sidebar and controls in initial HTML without a client account bootstrap", async () => {
    const view = await shell(signedIn);
    const html = view.markup();
    expect(html).toContain('aria-label="Workspace sidebar"');
    expect(html).toContain("Test Learner");
    expect(html).toContain("Test School");
    expect(html.match(/<a\b[^>]*href="\/student"[^>]*>/)?.[0]).toContain("focus-visible:ring-2");
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain("Ask CAN");
    expect(html.match(/<button[^>]*aria-label="Switch workspace"/g)).toHaveLength(1);
    expect(html).not.toContain("Switcher mode");
    expect(html).not.toContain("Loading account");
    expect(html).not.toContain("/teacher/gradebook");
    await Promise.all([
      view.queryClient.fetchQuery(workspaceSessionQueryOptions()),
      view.queryClient.fetchQuery(workspaceSessionQueryOptions()),
    ]);
    expect(state.read).toHaveBeenCalledTimes(1);
    view.queryClient.clear();
  });

  it("preserves deep-link search and fragment without another session bootstrap", async () => {
    const view = await shell(signedIn);
    expect(view.markup()).toContain('href="/messages?thread=test+thread#reply"');
    const destination = view.router.buildLocation({ href: "/messages?thread=test%20thread#reply" });
    expect(destination.pathname).toBe("/messages");
    expect(destination.search).toEqual({ thread: "test thread" });
    expect(destination.hash).toBe("reply");
    expect(view.markup()).toContain('aria-label="Workspace sidebar"');
    expect(state.read).toHaveBeenCalledTimes(1);
    view.queryClient.clear();
  });

  it("labels delegated demo switching without expanding the active student's navigation", async () => {
    if (!signedIn.session?.authenticated) throw new Error("Expected authenticated fixture");
    const view = await shell({
      ...signedIn, session: { ...signedIn.session, demoAccountSwitching: true },
    });
    const html = view.markup();
    expect(html).toContain('aria-label="Account menu"');
    expect(html).toContain("Demo admin session: acting as Test Learner (student)");
    expect(html).not.toContain("/admissions");
    expect(html).not.toContain('aria-label="Active membership"');
    view.queryClient.clear();
  });

  it("renders signed-out state and session failures explicitly, without inventing a membership", async () => {
    const guest = await shell(signedOut);
    expect(guest.markup()).toContain("Sign in");
    expect(guest.markup().match(/<a\b[^>]*href="\/"[^>]*>/)?.[0]).toContain("focus-visible:ring-2");
    expect(guest.markup()).not.toContain('aria-label="Workspace sidebar"');
    guest.queryClient.clear();
    const failure = await shell({ session: null, error: "Unable to load your workspace session." });
    expect(failure.markup()).toContain('role="alert"');
    expect(failure.markup()).toContain("Unable to load your workspace session.");
    expect(failure.markup()).not.toContain("Sign in");
    failure.queryClient.clear();
  });

  it("distinguishes session expiry, membership and scope changes from harmless result ordering", () => {
    const identity = workspaceSessionIdentity(signedIn);
    expect(workspaceSessionIdentity(signedOut)).not.toBe(identity);
    expect(workspaceSessionIdentity({ session: null, error: "Unavailable" })).toBeNull();
    if (!signedIn.session?.authenticated) throw new Error("Expected authenticated fixture");
    expect(workspaceSessionIdentity({
      session: { ...signedIn.session, activeGrantId: "another-grant" }, error: null,
    })).not.toBe(identity);
    expect(workspaceSessionIdentity({
      session: { ...signedIn.session, activeContext: { ...signedIn.session.activeContext, programIds: [] } }, error: null,
    })).not.toBe(identity);
    const multi = {
      session: { ...signedIn.session, activeContext: { ...signedIn.session.activeContext, siteIds: ["b", "a"] } }, error: null,
    };
    expect(workspaceSessionIdentity(multi)).toBe(workspaceSessionIdentity({
      ...multi, session: { ...multi.session, activeContext: { ...multi.session.activeContext, siteIds: ["a", "b"] } },
    }));
  });
});
