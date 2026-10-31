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

Unit tests added for timezone, loader classification, server-function factories, and the shared mutation hook. No feature routes were modified. Full repository TypeScript, Vitest, and lint commands require a checked-out workspace with dependencies; they have **not** been executed by the GitHub connector. Run `npm run typecheck`, `npx vitest run src/lib/safe-loader.test.ts src/modules/calendar/site-local-time.test.ts`, and focused ESLint before merging. Feature-agent adoption remains outstanding. The mutation-hook tests exercise the submit guard and invalidation callbacks; a browser-mounted integration test is still recommended.

## Final integration checklist

- `npm run typecheck`
- `npx vitest run src/platform/server-functions.test.ts src/lib/safe-loader.test.ts src/hooks/useWorkspaceMutation.test.tsx src/modules/calendar/site-local-time.test.ts`
- `npx eslint src/platform/server-functions.ts src/platform/server-functions.test.ts src/lib/safe-loader.ts src/lib/safe-loader.test.ts src/lib/loader-failure.tsx src/hooks/useWorkspaceMutation.ts src/hooks/useWorkspaceMutation.test.tsx src/modules/calendar/site-local-time.ts src/modules/calendar/site-local-time.test.ts`
- Run a browser-level test against a real authenticated endpoint before widespread migration.

GitHub connector commits are not proof of successful compilation or tests. No validation results are claimed here.

## Integration update (latest FullFlow)

- The working branch was fast-forwarded to canonical FullFlow commit `310e16d` before these follow-up edits. No merge into FullFlow was performed.
- `SerializableResult` constrains shared server-function outputs to JSON-compatible values; avoid returning Date, Map, Set, functions, undefined, or class instances. Domain results should be converted to explicit DTOs at the server boundary.
- Feature agents should migrate only after the real TanStack typecheck and code-verification workflow pass. The older mocked server-function tests are not a substitute for framework type verification.
- The new `platform-code-verification.yml` runs on PRs targeting FullFlow and pushes to the Agent A branch. It does not use Neon credentials. The manually triggered `fullflow-release-acceptance.yml` remains unchanged, isolated, and gated by preflight.
- Integration owner should require the code-verification job in FullFlow branch protection and separately require recorded connected acceptance before release, without running connected fixtures on ordinary PRs.
- Agent D owns admissions-specific connected acceptance. Agents C and E should adopt the typed mutation result discriminant and preserve existing domain authorization.
- Actual typecheck, unit, lint, and build results are pending CI execution. Do not infer green status from commits alone.

## Reusable loader presentation (component extraction)

- `LoaderErrorState` from `@/lib/loader-error-state` is a shell-free component for embedded panels, modals, and route content. It accepts the `safeLoader` failure outcome and optional `onRetry` / `retrying` props.
- `LoaderFailure` from `@/lib/loader-failure` remains the page-level adapter that composes `WorkspaceShell` with `LoaderErrorState`. Existing page consumers retain their interface.
- Retry is offered only when `outcome.retryable` is true; authentication failures retain the sign-in link and authorization denials do not imply missing login.
- Agents C, D, E: use the shell-free component inside an existing workspace page; use `LoaderFailure` only when the route needs the complete page shell. Do not duplicate the classification or sign-in logic.

## TanStack Start generic handler compatibility

The four generic server-function factories use `createServerFn({ method, strict: false })` because TanStack Start's conditional `ValidateSerializable` return type cannot prove that an unresolved generic `TResult` is serializable. This is a **type-checking escape hatch**, not a change to runtime transport behavior. The factories continue to require `TResult extends SerializableResult` (JSON primitives, arrays and plain objects), parse inputs with Zod, and obtain identity and authorization on the server. Do not use the factories for Date, Map, Set, Error, Response, class instances or functions. Add concrete direct `createServerFn` wrappers where richer serialization is required. See the TanStack Start server-functions documentation on `strict`.

Agent C: preserve the discriminated `submit` result. A completed mutation with `refreshError` must be treated as saved, not retried. Use `invalidateRouter` for route loader updates and show refresh errors separately from command errors.
