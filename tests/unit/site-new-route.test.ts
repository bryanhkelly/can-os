import { beforeEach, describe, expect, it, vi } from "vitest";
type Handler = (input: { request: Request }) => Promise<Response>;
const state = vi.hoisted(() => ({
  post: undefined as Handler | undefined,
  admission: vi.fn(),
  signup: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { server: { handlers: { POST: Handler } } }) => {
    state.post = options.server.handlers.POST;
    return {};
  },
}));
vi.mock("@/modules/identity/passwordless-access.server", () => ({ requestSiteSignup: state.signup }));
vi.mock("@/modules/identity/anonymous-auth-admission.server", () => ({
  admitAnonymousAuthRequest: state.admission,
  anonymousAuthAdmissionResponse: (value: { allowed: boolean }) => value.allowed ? null :
    Response.json({ error: "Too many requests." }, { status: 429 }),
}));
import "@/routes/site.new";

const input = { name: "Valor Learning Center", organizationName: "Grace Community Church",
  organizationType: "other_partner", organizationDomain: "gracechurch.org",
  firstName: "Alex", lastName: "Leader", email: "admin@example.org" };
function request(body: unknown, origin = "https://example.org") {
  return new Request("https://example.org/site/new", { method: "POST",
    headers: { Origin: origin }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.admission.mockResolvedValue({ allowed: true });
  state.signup.mockResolvedValue({ accepted: true });
});
describe("/site/new signup boundary", () => {
  it("requests email verification without directly creating a Site", async () => {
    const response = await state.post!({ request: request(input) });
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(state.signup).toHaveBeenCalledWith(input);
  });
  it("keeps a denomination request provisional rather than granting network authority", async () => {
    const data = { ...input, name: "National Learning Center",
      organizationName: "National Faith Network", organizationType: "denomination" };
    expect((await state.post!({ request: request(data) })).status).toBe(202);
    expect(state.signup).toHaveBeenCalledWith(data);
  });
  it("rejects malformed domains and shared-code bootstrap of a real organization", async () => {
    expect((await state.post!({ request: request({ ...input, organizationDomain: "https://gracechurch.org" }) })).status).toBe(400);
    expect((await state.post!({ request: request({ ...input, email: "admin@grace.demo" }) })).status).toBe(400);
    expect(state.signup).not.toHaveBeenCalled();
  });
  it("accepts a verified-email administrator for a demo organization", async () => {
    const data = { ...input, organizationDomain: "grace.demo" };
    expect((await state.post!({ request: request(data) })).status).toBe(202);
    expect(state.signup).toHaveBeenCalledWith(data);
  });
  it("rejects CAN-owned network classification from public signup", async () => {
    expect((await state.post!({ request: request({ ...input, organizationType: "can_network" }) })).status).toBe(400);
    expect(state.signup).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, oversize, and role or demo payloads", async () => {
    expect((await state.post!({ request: request(input, "https://evil.example") })).status).toBe(403);
    expect((await state.post!({ request: request({ ...input, role: "site_admin" }) })).status).toBe(400);
    expect((await state.post!({ request: request({ ...input, mode: "demo" }) })).status).toBe(400);
    expect((await state.post!({ request: request({ ...input, name: "x".repeat(4096) }) })).status).toBe(413);
    expect(state.signup).not.toHaveBeenCalled();
  });
  it("uses the anonymous admission gate before parsing personal details", async () => {
    state.admission.mockResolvedValue({ allowed: false });
    expect((await state.post!({ request: request(input) })).status).toBe(429);
    expect(state.signup).not.toHaveBeenCalled();
  });
  it("returns a generic setup error if the provisioning service throws", async () => {
    state.signup.mockRejectedValue(new Error("sender unavailable"));
    const response = await state.post!({ request: request(input) });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });
});
