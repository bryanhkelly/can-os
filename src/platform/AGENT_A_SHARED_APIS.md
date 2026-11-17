# Agent A shared infrastructure — initial API contract

Branch: `refactor/platform-foundations` (based on `FullFlow`).

## Client mutations

`useWorkspaceMutation<TInput, TResult>({ mutationFn, invalidateQueries?, onSuccess?, onError? })` from `src/hooks/useWorkspaceMutation.ts`.

Returns TanStack Query mutation state and `submit(input): Promise<WorkspaceSubmission<TResult>>`. The discriminant is `status: "completed" | "ignored"`; completed results carry `value` and optional `refreshError`.
Concurrent submissions through `submit` return `{ status: "ignored" }`. Domain-command failures reject and release the guard. Query and optional router invalidation occur only after a successful command; a refresh failure is reported separately and never turns a successful command into a failed command.

Example:

```ts
const save = useWorkspaceMutation({
  mutationFn: (input: SaveInput) => saveServerFn({ data: input }),
  invalidateQueries: [["site", siteId]],
  onSuccess: () => toast.success("Saved"),
});
const result = await save.submit(payload);\nif (result.status === "completed") {\n  // Command succeeded, even if result.refreshError is set.\n}
```

Use server-side authorization regardless of client mutation state.

## Site-local times

`siteLocalTimeToIso(value, timezone, ambiguity?)` and `isoToSiteLocalInput(instant, timezone)` from `src/modules/calendar/site-local-time.ts`.

The input format is `YYYY-MM-DDTHH:mm`. The ambiguity policy defaults to `reject`; specify `earlier` or `later` for DST fall-back overlaps. Spring-forward gaps always throw. These utilities do not use the browser timezone.

Agent C can replace launch-specific time conversions after validating the desired overlap policy.

## Production server authorization

The previously proposed generic `authenticatedQuery`, `authenticatedCommand`,
`scopedQuery`, and `institutionalDecision` factories had no production
callers and have been retired. They are **not** an authorization boundary.

Production modules use TanStack `createServerFn` directly, obtain identity
from verified server-side session context (`getCommandContext(getRequest())`
or `requireActor`), check the required capability, then enforce concrete
Site/Program/Section/resource scope before reading or writing. Institutional
decisions continue through their domain services and audit trail. Do not trust
client-provided identity, role, or authorization claims. Sensitive reads should
return `Cache-Control: private, no-store`.

The independent `@/platform/scope` registry **is active**: operations
insights register and invoke `readScope("insights", ...)`. Keep it until its
production consumer is explicitly migrated and covered by authorization tests.
The registry is resource-specific, not a universal authorization layer.

## Loader failures

`safeLoader` preserves its legacy `ok`, `data`, `authError`, and `message` contract and adds optional `kind` and `retryable` metadata. `classifyLoaderError` recognizes `AuthenticationRequiredError`, `AuthorizationError`, `DataUnavailableError`, and `RetryableLoaderError` by explicit error identity/name. Arbitrary error message text is never treated as proof of authentication failure. `LoaderFailure` links to sign-in only for authentication errors; authorization denial remains distinct.

Unexpected errors can be reported through `onUnexpectedError`; user-facing messages do not expose internal exception text. Optional secondary services should catch their own failures at the call site and preserve the primary result.

## Current verification checklist

- `npm run typecheck` and `npm run lint`
- `npx vitest run tests/unit/class-announcement-attempt.test.ts tests/unit/class-download.test.ts tests/unit/scope-registry.test.ts src/lib/safe-loader.test.ts`
- Confirm that Cloudflare runs scheduled jobs only from `src/server.ts`
- Browser-test authorized class resource downloads, retry-after-timeout announcements, and `/classes` with both learning and Site Admin roles
- Verify the production CSP permits Google Fonts stylesheets and font files while preserving other restrictions

The GitHub connector can change repository files but cannot itself certify a successful
local build or browser run. Report CI and browser acceptance separately from code commits.

## Reusable loader presentation (component extraction)

- `LoaderErrorState` from `@/lib/loader-error-state` is a shell-free component for embedded panels, modals, and route content. It accepts the `safeLoader` failure outcome and optional `onRetry` / `retrying` props.
- `LoaderFailure` from `@/lib/loader-failure` remains the page-level adapter that composes `WorkspaceShell` with `LoaderErrorState`. Existing page consumers retain their interface.
- Retry is offered only when `outcome.retryable` is true; authentication failures retain the sign-in link and authorization denials do not imply missing login.
- Agents C, D, E: use the shell-free component inside an existing workspace page; use `LoaderFailure` only when the route needs the complete page shell. Do not duplicate the classification or sign-in logic.

Agent C: preserve the discriminated `submit` result. A completed mutation with `refreshError` must be treated as saved, not retried. Use `invalidateRouter` for route loader updates and show refresh errors separately from command errors.
