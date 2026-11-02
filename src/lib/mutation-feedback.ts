import { useRef, useState } from "react";
import { normalizeClientError } from "@/lib/client-error";

export interface MutationFeedbackState {
  pending: boolean;
  error: string;
  notice: string;
  refreshFailed: boolean;
}

export type MutationOutcome<T> =
  | { status: "saved"; value: T }
  | { status: "refresh-failed"; value: T }
  | { status: "failed" }
  | { status: "refresh-required" }
  | { status: "duplicate" };

export interface MutationOptions<T> {
  fallback: string;
  success?: string | ((value: T) => string);
  refresh?: () => Promise<unknown>;
  refreshFallback?: string;
}

const initialState: MutationFeedbackState = {
  pending: false,
  error: "",
  notice: "",
  refreshFailed: false,
};

export function createMutationFeedbackRunner(
  publish: (state: MutationFeedbackState) => void,
) {
  let pending = false;
  let state = initialState;

  function update(next: MutationFeedbackState) {
    state = next;
    publish(state);
  }

  async function run<T>(
    command: () => Promise<T>,
    options: MutationOptions<T>,
  ): Promise<MutationOutcome<T>> {
    if (pending) return { status: "duplicate" };
    if (state.refreshFailed) return { status: "refresh-required" };
    pending = true;
    update({ pending: true, error: "", notice: "", refreshFailed: false });

    try {
      let value: T;
      try {
        value = await command();
      } catch (cause) {
        update({
          ...state,
          error: normalizeClientError(cause, { fallback: options.fallback }).message,
        });
        return { status: "failed" };
      }

      const notice = typeof options.success === "function"
        ? options.success(value)
        : options.success ?? "";
      update({ ...state, notice });

      if (options.refresh) {
        try {
          await options.refresh();
        } catch (cause) {
          const refreshMessage = normalizeClientError(cause, {
            fallback: options.refreshFallback ?? "the latest information could not be loaded.",
          }).message;
          update({
            ...state,
            error: `The command succeeded, but the page could not refresh: ${refreshMessage} Refresh the page to see the latest information.`,
            refreshFailed: true,
          });
          return { status: "refresh-failed", value };
        }
      }

      return { status: "saved", value };
    } finally {
      pending = false;
      update({ ...state, pending: false });
    }
  }

  return { run };
}

export function useMutationFeedback() {
  const [state, setState] = useState(initialState);
  const runner = useRef<ReturnType<typeof createMutationFeedbackRunner> | null>(null);
  runner.current ??= createMutationFeedbackRunner(setState);
  return {
    ...state,
    disabled: state.pending || state.refreshFailed,
    run: runner.current.run,
  };
}
