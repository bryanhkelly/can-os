import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";
import { canonicalOperationsUrlValid } from "@/domain/canonical-operations-connection";
import { measureServerStep } from "@/lib/performance/measure-server-step";
import { assertUnscopedDatabaseAllowed, isCloudflareWorkerRuntime } from "@/domain/worker-database-scope";

/**
 * Cloudflare Workers cannot share live WebSocket Pool clients across fetch
 * requests. Netlify's Node function runtime can reuse a module-local pool.
 *
 * Keep the canonical `db` export so every existing scoped query and Drizzle
 * interactive transaction uses the SAME instance within a request.
 */
function makePoolDatabase(connectionString: string) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const pool = new Pool({ connectionString });
  return { pool, database: drizzle(pool, { schema }) };
}

type PoolDatabase = ReturnType<typeof makePoolDatabase>;
type DatabaseClient = PoolDatabase["database"];
type RequestResource = { close: () => Promise<void> };
type RequestDatabase = PoolDatabase & { closed: boolean; resources: Map<string, RequestResource>; connectionString: string };

const requestDatabase = new AsyncLocalStorage<RequestDatabase>();
const restrictedOperationsDatabase = new AsyncLocalStorage<DatabaseClient>();
let nodeRestrictedOperations: { url: string; client: PoolDatabase } | undefined;
let nodeDatabase: PoolDatabase | undefined;

function activeDatabase(): DatabaseClient {
  // Reject work that leaked beyond a completed request before considering
  // the alternate restricted pool as well as the normal request pool.
  const scoped = requestDatabase.getStore();
  if (scoped?.closed) throw new Error("Database request scope has finished");
  const restricted = restrictedOperationsDatabase.getStore();
  if (restricted) return restricted;
  if (scoped) {
    return scoped.database;
  }
  // Workerd must never fall through to a long-lived Node pool, even when
  // its expected ingress bindings were omitted or misconfigured.
  assertUnscopedDatabaseAllowed(isCloudflareWorkerRuntime());
  // Outside Workerd, Netlify/Node retains its normal reusable Pool.
  nodeDatabase ??= makePoolDatabase(process.env.DATABASE_URL ?? "");
  return nodeDatabase.database;
}

/**
 * WebSocket pools belong to exactly one Worker request. The scope carries
 * through awaited loaders, server functions and transactions. Always close
 * connections even when rendering, authorization or a query throws.
 *
 * Nested calls share the current request instance; do not close it early.
 * Netlify does not use this wrapper and retains its Node-compatible pool.
 */
export async function withRequestDatabase<T>(
  operation: () => Promise<T>,
  connectionString = process.env.DATABASE_URL,
): Promise<T> {
  const existing = requestDatabase.getStore();
  if (existing) {
    if (existing.closed) throw new Error("Database request scope has finished");
    return operation();
  }
  const scoped: RequestDatabase = {
    ...makePoolDatabase(connectionString ?? ""),
    connectionString: connectionString ?? "",
    closed: false,
    resources: new Map(),
  };
  return requestDatabase.run(scoped, async () => {
    try {
      // Measures the entire authorized operation, not individual SQL statements.
      // Logging is strictly opt-in and never includes connection details.
      return await measureServerStep("db.request", "operation", operation);
    } finally {
      scoped.closed = true;
      // Cleanup must attempt every close, including resources that throw
      // synchronously. A cleanup failure must not mask the original error
      // or turn an already committed mutation into a retryable failure.
      try {
        await measureServerStep("db.request", "restricted-cleanup", async () => {
          const results = await Promise.allSettled([...scoped.resources.values()]
            .map(resource => Promise.resolve().then(() => resource.close())));
          if (results.some(result => result.status === "rejected"))
            console.warn("Database request cleanup failed", { resource: "restricted" });
        });
      } finally {
        try {
          await measureServerStep("db.request", "pool-close", () => scoped.pool.end());
        } catch {
          console.warn("Database request cleanup failed", { resource: "primary" });
        }
      }
    }
  });
}

/** Resolve one additional restricted resource per Worker request. Outside a
 * Worker request scope, Node callers may manage their own reusable instance.
 */
export function getRequestScopedResource<T extends RequestResource>(
  key: string, create: () => T,
): T | undefined {
  const scoped = requestDatabase.getStore();
  if (!scoped) {
    // All restricted pool consumers must honor the same Worker ingress
    // boundary as the primary database; only Node may reuse a global pool.
    assertUnscopedDatabaseAllowed(isCloudflareWorkerRuntime());
    return undefined;
  }
  if (scoped.closed) throw new Error("Database request scope has finished");
  const existing = scoped.resources.get(key);
  if (existing) return existing as T;
  const resource = create();
  scoped.resources.set(key, resource);
  return resource;
}

/**
 * Delegate canonical Program Catalog and Blueprint operations through a
 * dedicated non-owner, non-auth PostgreSQL LOGIN. The existing db proxy keeps
 * one schema and one transaction API; only the selected connection changes.
 * Worker pools are disposed with the current request; Node pools are reusable.
 * Never fall back to the owner connection when this credential is missing.
 */
export async function withCanonicalOperationsDatabase<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const url = process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
  const primaryUrl = requestDatabase.getStore()?.connectionString ?? process.env.DATABASE_URL;
  if (!canonicalOperationsUrlValid(
    url, primaryUrl, process.env.CAN_CANONICAL_AUTH_DATABASE_URL,
  )) {
    throw new Error("Restricted canonical operations database is not configured");
  }
  if (requestDatabase.getStore()?.closed) throw new Error("Database request scope has finished");
  if (restrictedOperationsDatabase.getStore()) return operation();

  const scoped = getRequestScopedResource("canonical-operations-database", () => {
    const client = makePoolDatabase(url!);
    return { ...client, close: () => client.pool.end() };
  });
  if (scoped) return restrictedOperationsDatabase.run(scoped.database, operation);

  // The restricted operations connection is a second Neon WebSocket pool.
  // It must never become a module singleton inside a Cloudflare Worker.
  assertUnscopedDatabaseAllowed(isCloudflareWorkerRuntime());
  if (!nodeRestrictedOperations || nodeRestrictedOperations.url !== url) {
    const previous = nodeRestrictedOperations;
    nodeRestrictedOperations = { url: url!, client: makePoolDatabase(url!) };
    if (previous) void previous.client.pool.end().catch(() => {});
  }
  return restrictedOperationsDatabase.run(nodeRestrictedOperations.client.database, operation);
}

/**
 * Drizzle is resolved when each query is *called*, not at module evaluation.
 * Bind methods to the concrete Drizzle instance to preserve their `this`
 * behavior (including db.transaction and relational db.query).
 * Never cache the resolved client or one of its methods across requests.
 */
export const db: DatabaseClient = new Proxy({} as DatabaseClient, {
  get(_target, key) {
    const client = activeDatabase();
    const value = Reflect.get(client, key, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Database = typeof db;
