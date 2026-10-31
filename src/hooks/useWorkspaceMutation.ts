import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

export interface WorkspaceMutationOptions<TInput, TResult> {
  mutationFn: (input: TInput) => Promise<TResult>;
  invalidateQueries?: readonly QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void | Promise<void>;
  onError?: (error: Error, input: TInput) => void;
}

/**
 * Shared mutation state, invalidation, and a synchronous duplicate-submit guard.
 * submit rejects on mutation failure; callers should catch it at the UI boundary.
 */
export function useWorkspaceMutation<TInput, TResult>(options: WorkspaceMutationOptions<TInput, TResult>) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation<TResult, Error, TInput>({
    mutationFn: options.mutationFn,
    onSuccess: async (result, input) => {
      await Promise.all((options.invalidateQueries ?? []).map(queryKey =>
        queryClient.invalidateQueries({ queryKey })));
      await options.onSuccess?.(result, input);
    },
    onError: options.onError,
  });
  const { mutateAsync } = mutation;
  const submit = useCallback(async (input: TInput): Promise<TResult | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await mutateAsync(input);
    } finally {
      inFlight.current = false;
    }
  }, [mutateAsync]);
  return { ...mutation, submit };
}
