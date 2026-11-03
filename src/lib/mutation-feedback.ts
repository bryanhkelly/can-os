import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeClientError } from "./client-error";
import { assertRefreshResult } from "./router-refresh";

export type MutationFeedbackState = {
  pending: boolean;
  error: string;
  notice: string;
  refreshFailed: boolean;
};

export type MutationOutcome<T> =
  | { status: "saved"; value: T }
  | { status: "refresh-failed"; value: T }
  | { status: "failed"; error: unknown }
  | { status: "duplicate" }
  | { status: "refresh-required" };

export type RefreshOutcome =
  | { status: "refreshed" }
  | { status: "not-required" }
  | { status: "refresh-failed" }
  | { status: "duplicate" };

export type MutationRunOptions<T> = {
  successMessage: string | ((value: T) => string);
  commandErrorMessage: string;
  refreshErrorMessage?: string;
  refresh?: () => Promise<unknown>;
};

type MutationRunnerOptions = {
  refresh: () => Promise<unknown>;
  update: (state: MutationFeedbackState) => void;
};

export function mutationErrorMessage(error: unknown, fallback: string): string {
  return normalizeClientError(error, fallback).message;
}

export function createMutationRunner({ refresh, update }: MutationRunnerOptions) {
  let inFlight = false;
  let refreshRequired = false;
  let failedRefresh: (() => Promise<unknown>) | undefined;
  let savedNotice = "";
  let refreshError = "";

  async function retryRefresh(): Promise<RefreshOutcome> {
    if (inFlight) return { status: "duplicate" };
    if (!refreshRequired || !failedRefresh) return { status: "not-required" };
    inFlight = true;
    update({ pending: true, error: "", notice: savedNotice, refreshFailed: true });
    try {
      assertRefreshResult(await failedRefresh());
      refreshRequired = false;
      failedRefresh = undefined;
      update({ pending: false, error: "", notice: savedNotice, refreshFailed: false });
      return { status: "refreshed" };
    } catch {
      update({ pending: false, error: refreshError, notice: savedNotice, refreshFailed: true });
      return { status: "refresh-failed" };
    } finally {
      inFlight = false;
    }
  }

  async function run<T>(
    command: () => Promise<T>,
    options: MutationRunOptions<T>,
  ): Promise<MutationOutcome<T>> {
    if (inFlight) return { status: "duplicate" };
    if (refreshRequired) return { status: "refresh-required" };

    inFlight = true;
    update({ pending: true, error: "", notice: "", refreshFailed: false });
    try {
      let value: T;
      try {
        value = await command();
      } catch (error) {
        update({
          pending: false,
          error: mutationErrorMessage(error, options.commandErrorMessage),
          notice: "",
          refreshFailed: false,
        });
        return { status: "failed", error };
      }

      const notice = typeof options.successMessage === "function"
        ? options.successMessage(value)
        : options.successMessage;
      try {
        assertRefreshResult(await (options.refresh ?? refresh)());
      } catch {
        refreshRequired = true;
        failedRefresh = options.refresh ?? refresh;
        savedNotice = notice;
        refreshError = options.refreshErrorMessage
          ?? "The command succeeded, but this page could not refresh. Retry the refresh before submitting again.";
        update({
          pending: false,
          error: refreshError,
          notice,
          refreshFailed: true,
        });
        return { status: "refresh-failed", value };
      }

      update({ pending: false, error: "", notice, refreshFailed: false });
      return { status: "saved", value };
    } finally {
      inFlight = false;
    }
  }
  return Object.assign(run, { retryRefresh });
}

export function useMutationFeedback(refresh: () => Promise<unknown>) {
  const [feedback, setFeedback] = useState<MutationFeedbackState>({
    pending: false,
    error: "",
    notice: "",
    refreshFailed: false,
  });
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);
  const runnerRef = useRef<ReturnType<typeof createMutationRunner> | null>(null);
  const getRunner = useCallback(() => {
    runnerRef.current ??= createMutationRunner({
      refresh: () => refreshRef.current(),
      update: setFeedback,
    });
    return runnerRef.current;
  }, []);
  const run = useCallback(async <T,>(
    command: () => Promise<T>,
    options: MutationRunOptions<T>,
  ): Promise<MutationOutcome<T>> => {
    return getRunner()(command, options);
  }, [getRunner]);
  const retryRefresh = useCallback(() => getRunner().retryRefresh(), [getRunner]);
  return { ...feedback, run, retryRefresh };
}
