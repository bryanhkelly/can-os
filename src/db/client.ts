import { AsyncLocalStorage } from "node:async_hooks";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

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
type RequestDatabase = PoolDatabase & { closed: boolean };

const requestDatabase = new AsyncLocalStorage<RequestDatabase>();
let nodeDatabase: PoolDatabase | undefined;

function activeDatabase(): DatabaseClient {
  const scoped = requestDatabase.getStore();
  if (scoped) {
    if (scoped.closed) throw new Error("Database request scope has finished");
    return scoped.database;
  }
  // Lazy initialization: Workers have no module-scope process.env bindings,
  // and their request MUST call withRequestDatabase before any db operation.
  // Outside that scope, Netlify/Node retains its normal reusable Pool.
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
  if (requestDatabase.getStore()) return operation();
  const scoped: RequestDatabase = {
    ...makePoolDatabase(connectionString ?? ""),
    closed: false,
  };
  return requestDatabase.run(scoped, async () => {
    try {
      return await operation();
    } finally {
      scoped.closed = true;
      await scoped.pool.end();
    }
  });
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
