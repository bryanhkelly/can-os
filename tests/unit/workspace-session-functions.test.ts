import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceSession } from "@/modules/identity/workspace-session.functions";
import "@/routes/access.session";

type GetHandler = (input: { request: Request }) => Promise<Response>;
const state = vi.hoisted(() => ({
  read: vi.fn(), header: vi.fn(),
  get: undefined as GetHandler | undefined,
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (handler: () => Promise<unknown>) => handler }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost/student"),
  setResponseHeader: state.header,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { server: { handlers: { GET: GetHandler } } }) => {
    state.get = options.server.handlers.GET;
    return {};
  },
}));
vi.mock("@/modules/identity/workspace-session.server", () => ({ readWorkspaceSession: state.read }));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: vi.fn() }));
vi.mock("@/modules/identity/passwordless-access.server", () => ({ selectAccessGrant: vi.fn() }));
vi.mock("@/db/client", () => ({ db: { select: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  state.read.mockResolvedValue({ authenticated: false });
});

describe("workspace session transport", () => {
  it("shares the verified read model between root bootstrap and the session endpoint", async () => {
    expect(await getWorkspaceSession()).toEqual({ session: { authenticated: false }, error: null });
    expect(state.header).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    const response = await state.get!({ request: new Request("http://localhost/access/session") });
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ authenticated: false });
    expect(state.read).toHaveBeenCalledTimes(2);
  });

  it("reports infrastructure failures explicitly without exposing server error details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      state.read.mockRejectedValue(new Error("Private connection diagnostics"));
      expect(await getWorkspaceSession()).toEqual({
        session: null, error: "Unable to load your workspace session. Please try again.",
      });
      const response = await state.get!({ request: new Request("http://localhost/access/session") });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Unable to load your workspace session." });
      expect(log).toHaveBeenCalledTimes(2);
    } finally {
      log.mockRestore();
    }
  });
});
