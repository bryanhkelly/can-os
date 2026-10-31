import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useRef } from "react";

export interface WorkspaceMutationOptions<TInput, TResult> {
  mutationFn: (input: TInput) => Promise<TResult>;
  invalidateQueries?: readonly QueryKey[];
  onSuccess?: (result: TResult, input: TInput) => void | Promise<void>;
  onError?: (error: Error, input: TInput) => void;
}

/** Uses TanStack Query's mutation lifecycle; synchronous guard blocks double clicks. */
export function useWorkspaceMutation<TInput, TResult>(options: WorkspaceMutationOptions<TInput, TResult>) {
  const queryClient = useQueryClient();
  const inFlight = useRef(false);
  const mutation = useMutation<TResult, Error, TInput>({
    mutationFn: options.mutationFn,
    onSuccess: async (result, input) => {
      await Promise.all((options.invalidateQueries ?? []).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey })));
      await options.onSuccess?.(result, input);
    },
    onError: options.onError,
  });
  const submit = async (input: TInput): Promise<TResult | undefined> => {
    if (inFlight.current) return undefined;
    inFlight.current = true;
    try {
      return await mutation.mutateAsync(input);
    } finally {
      inFlight.current = false;
    }
  };
  return { ...mutation, submit, isPending: mutation.isPending };
}
