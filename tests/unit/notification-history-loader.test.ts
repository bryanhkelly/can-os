import { beforeEach, describe, expect, it, vi } from "vitest";
import "@/routes/notifications";

type Options = {
  validateSearch: (search: Record<string, unknown>) => { notification?: string; deliveryCursor?: string };
  loaderDeps: (input: { search: { deliveryCursor?: string } }) => { deliveryCursor?: string };
  loader: (input: { deps: { deliveryCursor?: string } }) => Promise<unknown>;
};
const state = vi.hoisted(() => ({
  options: undefined as Options | undefined,
  notices: vi.fn(),
  history: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: Options) => { state.options = options; return {}; },
  Link: vi.fn(), useRouter: vi.fn(),
}));
vi.mock("@/modules/communication/notification-center.functions", () => ({
  getNotifications: state.notices, readNotification: state.read,
  readAllNotifications: state.read, setNotificationStatus: state.read,
}));
vi.mock("@/modules/communication/delivery-history.functions", () => ({ getDeliveryHistory: state.history }));

beforeEach(() => {
  vi.clearAllMocks();
  state.notices.mockResolvedValue([{ id: "notice" }]);
  state.history.mockResolvedValue({ items: [], nextCursor: null });
});

describe("shared notification center history wiring", () => {
  it("validates and forwards the page cursor without mutating notification state", async () => {
    const options = state.options!;
    const cursor = crypto.randomUUID();
    expect(options.validateSearch({ notification: "notice", deliveryCursor: cursor }))
      .toEqual({ notification: "notice", deliveryCursor: cursor });
    expect(options.loaderDeps({ search: { deliveryCursor: cursor } })).toEqual({ deliveryCursor: cursor });
    expect(await options.loader({ deps: { deliveryCursor: cursor } })).toEqual({
      ok: true, data: { notices: [{ id: "notice" }], history: { ok: true, data: { items: [], nextCursor: null } } },
    });
    expect(state.history).toHaveBeenCalledWith({ data: { cursor } });
    expect(state.read).not.toHaveBeenCalled();
  });
  it("keeps existing notifications available when history fails", async () => {
    state.history.mockRejectedValueOnce(new Error("Unavailable cursor"));
    expect(await state.options!.loader({ deps: {} })).toEqual({
      ok: true, data: { notices: [{ id: "notice" }], history: { ok: false, authError: null, message: "An unexpected error occurred. Please try again.", kind: "unexpected", retryable: false } },
    });
  });
  it("rejects invalid pagination parameters instead of silently selecting another page", () => {
    expect(() => state.options!.validateSearch({ deliveryCursor: "invalid" })).toThrow();
  });
});
