import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainError } from "@/domain/errors";

type Handler = (input: { request: Request }) => Promise<Response>;
const state = vi.hoisted(() => ({
  post: undefined as Handler | undefined, admit: vi.fn(), setup: vi.fn(), signup: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { server: { handlers: { POST: Handler } } }) => {
    state.post = options.server.handlers.POST;
    return {};
  },
}));
vi.mock("@/modules/identity/school-setup.server", () => ({ setupSchool: state.setup }));
vi.mock("@/modules/identity/passwordless-access.server", () => ({ requestSchoolSetupAccess: state.signup }));
vi.mock("@/modules/identity/anonymous-auth-admission.server", () => ({
  admitAnonymousAuthRequest: state.admit,
  anonymousAuthAdmissionResponse: (gate: { allowed: boolean }) => gate.allowed ? null :
    Response.json({ error: "Too many requests." }, { status: 429 }),
}));
import "@/routes/schools.new";

const input = { name: "Example", domain: "example.demo", timezone: "UTC", syntheticOnly: true };
const request = (body: unknown, origin = "https://app.example.test") => new Request(
  "https://app.example.test/schools/new", {
    method: "POST", headers: { Origin: origin }, body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.admit.mockResolvedValue({ allowed: true });
  state.setup.mockResolvedValue({ created: true, domain: "example.demo", adminEmail: "admin.demo@example.demo" });
  state.signup.mockResolvedValue({ accepted: true });
});
afterEach(() => vi.restoreAllMocks());

describe("public school setup HTTP boundary", () => {
  it("allows an anonymous visitor to create a demo school, never a caller-selected identity", async () => {
    const response = await state.post!({ request: request(input) });
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.admit).toHaveBeenCalledWith("school_setup");
    expect(state.setup).toHaveBeenCalledWith(input);
  });
  it("starts real school setup through verified email with only the submitted school and administrator fields", async () => {
    const body = { mode: "email", name: "Example School", email: "admin@example.org",
      firstName: "Alex", lastName: "Admin" };
    const response = await state.post!({ request: request(body) });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(state.signup).toHaveBeenCalledWith({ name: "Example School", email: "admin@example.org",
      firstName: "Alex", lastName: "Admin" });
    expect(state.setup).not.toHaveBeenCalled();
  });
  it("returns an idempotent retry as existing rather than a second creation", async () => {
    state.setup.mockResolvedValue({ created: false, domain: "example.demo" });
    expect((await state.post!({ request: request(input) })).status).toBe(200);
  });
  it("rejects cross-origin calls before admission or provisioning", async () => {
    expect((await state.post!({ request: request(input, "https://foreign.example.test") })).status).toBe(403);
    expect(state.admit).not.toHaveBeenCalled();
    expect(state.setup).not.toHaveBeenCalled();
  });
  it("enforces admission before parsing submitted identities", async () => {
    state.admit.mockResolvedValue({ allowed: false });
    expect((await state.post!({ request: request(input) })).status).toBe(429);
    expect(state.setup).not.toHaveBeenCalled();
  });
  it.each([{ domain: "real-school.org" }, { syntheticOnly: false }, { role: "site_admin" },
    { siteId: "foreign-school" }, { domain: "valorschool.demo" }])("rejects unsafe input %j", async change => {
    expect((await state.post!({ request: request({ ...input, ...change }) })).status).toBe(400);
    expect(state.setup).not.toHaveBeenCalled();
  });
  it("rejects demo identities in the real-email path", async () => {
    const response = await state.post!({ request: request({ mode: "email", name: "Example School",
      email: "admin@example.demo", firstName: "Alex", lastName: "Admin" }) });
    expect(response.status).toBe(400);
    expect(state.signup).not.toHaveBeenCalled();
  });
  it("rejects oversized payloads", async () => {
    expect((await state.post!({ request: request({ ...input, name: "x".repeat(4096) }) })).status).toBe(413);
    expect(state.setup).not.toHaveBeenCalled();
  });
  it("surfaces an occupied domain explicitly", async () => {
    state.setup.mockRejectedValue(new DomainError("CONFLICT"));
    expect((await state.post!({ request: request(input) })).status).toBe(409);
  });
  it.each(["admit", "setup"] as const)("fails closed on %s errors without leaking database details", async step => {
    state[step].mockRejectedValue(new Error("postgres://private-password@private-host/database"));
    const response = await state.post!({ request: request(input) });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(JSON.stringify(await response.json())).not.toContain("private-password");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("private-password");
  });
});
