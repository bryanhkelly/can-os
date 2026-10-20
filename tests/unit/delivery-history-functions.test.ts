import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeliveryHistory } from "@/modules/communication/delivery-history.functions";

const state = vi.hoisted(() => ({
  context: { actorPersonId: "verified-person", capabilities: new Set<string>(), scope: {} },
  list: vi.fn(),
  header: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    parse: (input: unknown) => input,
    validator(parse: (input: unknown) => unknown) { this.parse = parse; return this; },
    handler(callback: (input: { data: unknown }) => unknown) {
      return async (input: { data: unknown }) => callback({ data: this.parse(input.data) });
    },
  }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => new Request("http://localhost"), setResponseHeader: state.header,
}));
vi.mock("@/modules/identity/command-context.server", () => ({ getCommandContext: async () => state.context }));
vi.mock("@/modules/communication/delivery-history.server", () => ({ listDeliveryHistory: state.list }));

beforeEach(() => {
  vi.clearAllMocks();
  state.list.mockResolvedValue({ items: [], nextCursor: null });
});

describe("delivery history server boundary", () => {
  it("uses the verified actor and disables caching", async () => {
    const cursor = crypto.randomUUID();
    expect(await getDeliveryHistory({ data: { cursor } })).toEqual({ items: [], nextCursor: null });
    expect(state.list).toHaveBeenCalledWith(state.context, cursor);
    expect(state.header).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it("does not accept a client-selected recipient", async () => {
    const input = { cursor: undefined, personId: "someone-else" };
    await getDeliveryHistory({ data: input });
    expect(state.list).toHaveBeenCalledWith(state.context, undefined);
  });
  it("rejects malformed cursors before querying history", async () => {
    await expect(getDeliveryHistory({ data: { cursor: "not-a-uuid" } })).rejects.toThrow();
    expect(state.list).not.toHaveBeenCalled();
  });
  it("propagates service failures rather than reporting an empty successful history", async () => {
    state.list.mockRejectedValueOnce(new Error("History unavailable"));
    await expect(getDeliveryHistory({ data: {} })).rejects.toThrow("History unavailable");
  });
});
