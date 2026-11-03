import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { assertRefreshResult } from "@/lib/router-refresh";

export type WorkspaceSubmission<TResult> =
  | { status: "completed"; value: TResult; refreshError?: Error }
  | { status: "ignored" };

export interface WorkspaceMutationOptions<TInput, TResult> {
  mutationFn: (input: TInput) => Promise<TResult>;
  invalidateQueries?: readonly QueryKey[];
  invalidateRouter?: () => Promise<unknown> | unknown;
  onSuccess?: (result: TResult, input: TInput) => void | Promise<void>;
  onError?: (error: Error, input: TInput) => void;
  onRefreshError?: (error: Error) => void;
}

function asError(error: unknown): Error {
  return new Error(mutationErrorMessage(error, "Unable to refresh saved changes."));
}

/**
 * Domain commands are executed exactly once per submit cycle. Cache/router
 * refreshes are intentionally outside the mutation lifecycle: refresh failures
 * cannot turn a successful command into a failed command and invite a retry.
 */
export function useWorkspaceMutation<TInput, TResult>(options: WorkspaceMutationOptions<TInput, TResult>) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const failedRefresh = useRef<(() => Promise<void>) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshError, setRefreshError] = useState<Error | null>(null);
  const mutation = useMutation<TResult, Error, TInput>({
    mutationFn: options.mutationFn,
    onError: (error, input) => optionsRef.current.onError?.(error, input),
  });
  const { mutateAsync } = mutation;

  const submit = useCallback(async (input: TInput): Promise<WorkspaceSubmission<TResult>> => {
    if (inFlight.current || failedRefresh.current) return { status: "ignored" };
    inFlight.current = true;
    setIsSubmitting(true);
    setRefreshError(null);
    try {
      const value = await mutateAsync(input);
      const current = optionsRef.current;
      const refresh = async () => {
        await Promise.all((current.invalidateQueries ?? []).map(queryKey =>
          queryClient.invalidateQueries({ queryKey }, { throwOnError: true })));
        assertRefreshResult(await current.invalidateRouter?.());
      };
      let failure: Error | undefined;
      try {
        await refresh();
      } catch (error) {
        failedRefresh.current = refresh;
        failure = asError(error);
        setRefreshError(failure);
        try { current.onRefreshError?.(failure); } catch { /* Preserve committed command status. */ }
      }
      try {
        await current.onSuccess?.(value, input);
      } catch (error) {
        // Feedback callbacks run after the domain command has committed.
        // Never turn their failure into a command failure or invite a retry.
        failure ??= asError(error);
        failedRefresh.current = refresh;
        setRefreshError(failure);
        try { current.onRefreshError?.(failure); } catch { /* Preserve committed command status. */ }
      }
      return { status: "completed", value, ...(failure ? { refreshError: failure } : {}) };
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, [mutateAsync, queryClient]);

  const retryRefresh = useCallback(async () => {
    if (inFlight.current) return { status: "duplicate" as const };
    if (!failedRefresh.current) return { status: "not-required" as const };
    inFlight.current = true;
    setIsSubmitting(true);
    try {
      await failedRefresh.current();
      failedRefresh.current = null;
      setRefreshError(null);
      return { status: "refreshed" as const };
    } catch (error) {
      setRefreshError(asError(error));
      return { status: "refresh-failed" as const };
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  }, []);

  return { ...mutation, submit, isSubmitting, refreshError, retryRefresh };
}
