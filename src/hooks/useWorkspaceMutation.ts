import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { createMutationRunner, mutationErrorMessage } from "@/lib/mutation-feedback";
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
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [refreshError, setRefreshError] = useState<Error | null>(null);
  const runnerRef = useRef<ReturnType<typeof createMutationRunner> | null>(null);
  runnerRef.current ??= createMutationRunner({
    refresh: async () => undefined,
    update: state => {
      setIsSubmitting(state.pending);
      setRefreshError(state.refreshFailed ? new Error(state.error || "Unable to refresh saved changes.") : null);
    },
  });
  const runner = runnerRef.current;
  const mutation = useMutation<TResult, Error, TInput>({
    mutationFn: options.mutationFn,
    retry: false,
    onError: (error, input) => optionsRef.current.onError?.(error, input),
  });
  const { mutateAsync } = mutation;

  const submit = useCallback(async (input: TInput): Promise<WorkspaceSubmission<TResult>> => {
    let current = optionsRef.current;
    let value: TResult;
    let notified = false;
    let refreshFailure: Error | undefined;
    const outcome = await runner(async () => {
      value = await mutateAsync(input);
      current = optionsRef.current;
      return value;
    }, {
      successMessage: "",
      commandErrorMessage: "Unable to save changes.",
      refreshErrorMessage: "Unable to refresh saved changes.",
      refresh: async () => {
        let failure: Error | undefined;
        try {
          await Promise.all((current.invalidateQueries ?? []).map(queryKey =>
            queryClient.invalidateQueries({ queryKey }, { throwOnError: true })));
          assertRefreshResult(await current.invalidateRouter?.());
        } catch (error) {
          failure = asError(error);
        }
        if (!notified) {
          notified = true;
          try { await current.onSuccess?.(value, input); }
          catch (error) { failure ??= asError(error); }
        }
        if (failure) {
          refreshFailure = failure;
          try { current.onRefreshError?.(failure); } catch { /* Preserve committed command status. */ }
          throw failure;
        }
      },
    });
    if (outcome.status === "failed") throw outcome.error;
    if (outcome.status === "duplicate" || outcome.status === "refresh-required") return { status: "ignored" };
    return { status: "completed", value: outcome.value, ...(refreshFailure ? { refreshError: refreshFailure } : {}) };
  }, [mutateAsync, queryClient, runner]);

  const retryRefresh = useCallback(() => runner.retryRefresh(), [runner]);

  return { ...mutation, submit, isSubmitting, refreshError, retryRefresh };
}
