# Agent A shared infrastructure — initial API contract

Branch: `refactor/platform-foundations` (based on `FullFlow`).

## Client mutations

`useWorkspaceMutation<TInput, TResult>({ mutationFn, invalidateQueries?, onSuccess?, onError? })` from `src/hooks/useWorkspaceMutation.ts`.

Returns TanStack Query mutation state and `submit(input): Promise<TResult | undefined>`.
Concurrent submissions through `submit` are ignored. Errors from the underlying mutation are propagated; callers should handle rejected promises. Query invalidation completes before the success callback.

Example:

```ts
const save = useWorkspaceMutation({
  mutationFn: (input: SaveInput) => saveServerFn({ data: input }),
  invalidateQueries: [["site", siteId]],
  onSuccess: () => toast.success("Saved"),
});
await save.submit(payload);
```

Use server-side authorization regardless of client mutation state.

## Site-local times

`siteLocalTimeToIso(value, timezone, ambiguity?)` and `isoToSiteLocalInput(instant, timezone)` from `src/modules/calendar/site-local-time.ts`.

The input format is `YYYY-MM-DDTHH:mm`. The ambiguity policy defaults to `reject`; specify `earlier` or `later` for DST fall-back overlaps. Spring-forward gaps always throw. These utilities do not use the browser timezone.

Agent C can replace launch-specific time conversions after validating the desired overlap policy.

## Pending coordination

Server function wrappers and loader error classification require further review of existing auth and loader contracts. Do not migrate feature endpoints until those contracts are published and tested. This branch does not change any feature routes.
