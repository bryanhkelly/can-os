import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  invalidateQueries: vi.fn(async () => undefined),
  options: { current: null as null | Record<string, unknown> },
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
  useMutation: (options: Record<string, unknown>) => {
    mocks.options.current = options;
    return { mutateAsync: mocks.mutateAsync, isPending: false, isError: false, isSuccess: false };
  },
}));

import { useWorkspaceMutation } from "./useWorkspaceMutation";

describe("useWorkspaceMutation", () => {
  it("blocks concurrent submissions and unlocks after resolution", async () => {
    let release!: (value: string) => void;
    const deferred = new Promise<string>(resolve => { release = resolve; });
    mocks.mutateAsync.mockReset().mockImplementationOnce(() => deferred).mockResolvedValueOnce("second");
    let submit!: (value: string) => Promise<import("./useWorkspaceMutation").WorkspaceSubmission<string>>;
    function Harness() {
      submit = useWorkspaceMutation<string, string>({ mutationFn: async value => value }).submit;
      return null;
    }
    renderToString(createElement(Harness));
    const first = submit("first");
    expect(await submit("duplicate")).toEqual({ status: "ignored" });
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    release("first");
    expect(await first).toEqual({ status: "completed", value: "first" });
    expect(await submit("second")).toEqual({ status: "completed", value: "second" });
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when mutation rejects", async () => {
    mocks.mutateAsync.mockReset().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce("recovered");
    let submit!: (value: string) => Promise<import("./useWorkspaceMutation").WorkspaceSubmission<string>>;
    function Harness() {
      submit = useWorkspaceMutation<string, string>({ mutationFn: async value => value }).submit;
      return null;
    }
    renderToString(createElement(Harness));
    await expect(submit("fail")).rejects.toThrow("failed");
    await expect(submit("retry")).resolves.toEqual({ status: "completed", value: "recovered" });
  });

  it("reports refresh failure without retrying a successful command", async () => {
    mocks.mutateAsync.mockReset().mockResolvedValue("saved");
    mocks.invalidateQueries.mockReset().mockRejectedValueOnce(new Error("offline"));
    let submit!: (value: string) => Promise<import("./useWorkspaceMutation").WorkspaceSubmission<string>>;
    function Harness() {
      submit = useWorkspaceMutation<string, string>({
        mutationFn: async value => value,
        invalidateQueries: [["site"]],
      }).submit;
      return null;
    }
    renderToString(createElement(Harness));
    const result = await submit("save");
    expect(result.status).toBe("completed");
    if (result.status === "completed") expect(result.refreshError?.message).toBe("offline");
    expect(mocks.mutateAsync).toHaveBeenCalledOnce();
  });
});
