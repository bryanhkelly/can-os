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

## Verified server functions

Import from `@/platform/server-functions`:

- `authenticatedQuery(schema, async (context, input) => result)`
- `authenticatedCommand(schema, async (context, input) => result)`
- `scopedQuery(schema, capability, resourceGuard, handler)`
- `institutionalDecision(schema, capability, resourceGuard, decide)`

These use the existing verified `getCommandContext(getRequest())` / `withAuth` infrastructure, parse input with Zod, and set `Cache-Control: private, no-store`. The context and resource authorization are never derived from browser roles or scope. A resource guard must perform the existing domain-specific checks, and institutional decisions must continue using existing decision/audit services.

Example:

```ts
const input = z.object({ siteId: z.string().uuid() });
export const getSiteSummary = scopedQuery(
  input,
  "site:read",
  async (actor, data) => assertSiteScope(actor, data.siteId),
  async (actor, data) => readAuthorizedSiteSummary(actor, data.siteId),
);
```

Do not replace a specialized institutional authorization check with `assertSiteScope` alone. Coordinate migrations with the relevant feature owner.

## Loader failures

`safeLoader` preserves its legacy `ok`, `data`, `authError`, and `message` contract and adds optional `kind` and `retryable` metadata. `classifyLoaderError` recognizes `AuthenticationRequiredError`, `AuthorizationError`, `DataUnavailableError`, and `RetryableLoaderError` by explicit error identity/name. Arbitrary error message text is never treated as proof of authentication failure. `LoaderFailure` links to sign-in only for authentication errors; authorization denial remains distinct.

Unexpected errors can be reported through `onUnexpectedError`; user-facing messages do not expose internal exception text. Optional secondary services should catch their own failures at the call site and preserve the primary result.

## Validation and remaining adoption

Unit tests added for timezone and loader classification. No feature routes were modified. Full repository TypeScript, Vitest, and lint commands require a checked-out workspace with dependencies; they have **not** been executed by the GitHub connector. Run `npm run typecheck`, `npx vitest run src/lib/safe-loader.test.ts src/modules/calendar/site-local-time.test.ts`, and focused ESLint before merging. Feature-agent adoption and further tests of the React mutation hook are outstanding.
