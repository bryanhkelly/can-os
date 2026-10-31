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
    let submit!: (value: string) => Promise<string | undefined>;
    function Harness() {
      submit = useWorkspaceMutation<string, string>({ mutationFn: async value => value }).submit;
      return null;
    }
    renderToString(createElement(Harness));
    const first = submit("first");
    expect(await submit("duplicate")).toBeUndefined();
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(1);
    release("first");
    expect(await first).toBe("first");
    expect(await submit("second")).toBe("second");
    expect(mocks.mutateAsync).toHaveBeenCalledTimes(2);
  });

  it("releases the guard when mutation rejects", async () => {
    mocks.mutateAsync.mockReset().mockRejectedValueOnce(new Error("failed")).mockResolvedValueOnce("recovered");
    let submit!: (value: string) => Promise<string | undefined>;
    function Harness() {
      submit = useWorkspaceMutation<string, string>({ mutationFn: async value => value }).submit;
      return null;
    }
    renderToString(createElement(Harness));
    await expect(submit("fail")).rejects.toThrow("failed");
    await expect(submit("retry")).resolves.toBe("recovered");
  });

  it("invalidates all supplied keys before notifying success", async () => {
    mocks.invalidateQueries.mockClear();
    const onSuccess = vi.fn();
    function Harness() {
      useWorkspaceMutation({
        mutationFn: async (value: string) => value,
        invalidateQueries: [["site", "a"], ["family", "b"]],
        onSuccess,
      });
      return null;
    }
    renderToString(createElement(Harness));
    const callbacks = mocks.options.current as { onSuccess: (value: string, input: string) => Promise<void> };
    await callbacks.onSuccess("ok", "input");
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(2);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["site", "a"] });
    expect(onSuccess).toHaveBeenCalledWith("ok", "input");
  });
});
