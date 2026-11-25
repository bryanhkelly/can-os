import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  nextId: 0,
  created: [] as number[],
  ended: [] as number[],
  connectionStrings: [] as string[],
  failClose: new Set<number>(),
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class MockPool {
    readonly id: number;
    constructor({ connectionString }: { connectionString: string }) {
      this.id = ++state.nextId;
      state.created.push(this.id);
      state.connectionStrings.push(connectionString);
    }
    async end() {
      state.ended.push(this.id);
      if (state.failClose.has(this.id)) throw new Error("synthetic pool close failure");
    }
  },
}));

// Real Drizzle methods require the same `this` as the owning connection.
vi.mock("drizzle-orm/neon-serverless", () => ({
  drizzle: (pool: { id: number }) => ({
    marker: pool.id,
    select(this: { marker: number }) { return this.marker; },
    transaction(this: { marker: number }, action: (tx: { connection: number }) => Promise<unknown>) {
      return action({ connection: this.marker });
    },
  }),
}));

import { db, withRequestDatabase, withCanonicalOperationsDatabase, getRequestScopedResource } from "@/db/client";

const identity = () => Reflect.get(db, "marker") as number;
const boundSelect = () => (Reflect.get(db, "select") as () => number)();

describe("Cloudflare and Netlify Neon pooling", () => {
  it("does not create a module-scoped pool before the first request", () => {
    expect(state.created).toHaveLength(0);
  });

  it("creates and closes a single request-local Cloudflare Pool", async () => {
    const value = await withRequestDatabase(async () => {
      const id = identity();
      expect(boundSelect()).toBe(id);
      expect(state.ended).not.toContain(id);
      const transaction = await db.transaction(async tx => (tx as unknown as { connection: number }).connection);
      expect(transaction).toBe(id);
      const nested = await withRequestDatabase(async () => {
        await Promise.resolve();
        return identity();
      }, "postgresql://should-not-create-another-pool");
      expect(nested).toBe(id);
      return id;
    }, "postgresql://request-1");

    expect(state.created).toEqual([value]);
    expect(state.ended).toEqual([value]);
    expect(state.connectionStrings).toEqual(["postgresql://request-1"]);
  });

  it("keeps simultaneous Cloudflare requests isolated across await boundaries", async () => {
    const workload = (delay: number) => withRequestDatabase(async () => {
      const before = identity();
      await new Promise(resolve => setTimeout(resolve, delay));
      return { before, after: boundSelect() };
    }, "postgresql://request-" + delay);
    const [a, b, c] = await Promise.all([workload(12), workload(2), workload(6)]);

    expect(new Set([a.before, b.before, c.before]).size).toBe(3);
    for (const result of [a, b, c]) expect(result.after).toBe(result.before);
    for (const result of [a, b, c]) expect(state.ended).toContain(result.before);
  });

  it("closes the Cloudflare pool on an exception", async () => {
    let id = 0;
    await expect(withRequestDatabase(async () => {
      id = identity();
      throw new Error("simulated route failure");
    }, "postgresql://failure")).rejects.toThrow("simulated route failure");
    expect(state.ended).toContain(id);
  });

  it("attempts every restricted close and preserves a successful mutation result", async () => {
    const closeLater = vi.fn(async () => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let id = 0;
    try {
      const result = await withRequestDatabase(async () => {
        id = identity();
        state.failClose.add(id);
        getRequestScopedResource("broken", () => ({ close() { throw new Error("synthetic restricted close failure"); } }));
        getRequestScopedResource("later", () => ({ close: closeLater }));
        return "committed";
      }, "postgresql://cleanup-test");
      expect(result).toBe("committed");
      expect(closeLater).toHaveBeenCalledOnce();
      expect(state.ended).toContain(id);
      expect(warn).toHaveBeenCalledWith("Database request cleanup failed", { resource: "restricted" });
      expect(warn).toHaveBeenCalledWith("Database request cleanup failed", { resource: "primary" });
    } finally {
      state.failClose.delete(id);
      warn.mockRestore();
    }
  });

  it("preserves the original route error even if closing the pool fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let id = 0;
    try {
      const original = new Error("original failure");
      await expect(withRequestDatabase(async () => {
        id = identity();
        state.failClose.add(id);
        throw original;
      }, "postgresql://failed-cleanup")).rejects.toBe(original);
      expect(state.ended).toContain(id);
    } finally {
      state.failClose.delete(id);
      warn.mockRestore();
    }
  });

  it("rejects detached nested operations after the request closes", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let detached!: Promise<unknown>;
    await withRequestDatabase(async () => {
      detached = gate.then(() => withRequestDatabase(async () => "must not run"));
    }, "postgresql://detached");
    const rejection = expect(detached).rejects.toThrow("Database request scope has finished");
    release();
    await rejection;
  });

  it("isolates and closes a delegated Blueprint database pool without replacing the owner's request scope", async () => {
    const url="postgresql://can_os_canonical_ops_app:operations@ep-test-pooler.example.org/neondb";
    const owner="postgresql://neondb_owner:owner@ep-test-pooler.example.org/neondb";
    const previous=process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
    const previousAuth=process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
    let restricted=0, request=0;
    try {
      process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL=url;
      delete process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
      await withRequestDatabase(async () => {
        request=identity();
        restricted=await withCanonicalOperationsDatabase(async () => {
          const id=identity();
          expect(id).not.toBe(request);
          expect(boundSelect()).toBe(id);
          expect(await db.transaction(async tx=>(tx as unknown as {connection:number}).connection)).toBe(id);
          expect(await withCanonicalOperationsDatabase(async()=>identity())).toBe(id);
          return id;
        });
        expect(identity()).toBe(request);
        expect(state.ended).not.toContain(restricted);
      },owner);
      expect(state.ended).toContain(request);
      expect(state.ended).toContain(restricted);
      expect(state.connectionStrings).toContain(url);
    }finally{
      if(previous===undefined)delete process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
      else process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL=previous;
      if(previousAuth===undefined)delete process.env.CAN_CANONICAL_AUTH_DATABASE_URL;
      else process.env.CAN_CANONICAL_AUTH_DATABASE_URL=previousAuth;
    }
  });

  it("denies missing operations credentials rather than using the owner database", async () => {
    const previous=process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
    try{
      delete process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
      await withRequestDatabase(async()=>{
        const ownerId=identity();
        await expect(withCanonicalOperationsDatabase(async()=>identity()))
          .rejects.toThrow("Restricted canonical operations database is not configured");
        expect(identity()).toBe(ownerId);
      },"postgresql://neondb_owner:owner@ep-test-pooler.example.org/neondb");
    }finally{
      if(previous===undefined)delete process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL;
      else process.env.CAN_CANONICAL_OPERATIONS_DATABASE_URL=previous;
    }
  });

  it("rejects an unscoped Worker restricted resource before creating it", () => {
    vi.stubGlobal("WebSocketPair", class {});
    const factory = vi.fn(() => ({close: async () => {}}));
    try {
      expect(() => getRequestScopedResource("restricted",factory)).toThrow("withRequestDatabase");
      expect(factory).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("preserves the reusable Node/Netlify pool outside the Worker wrapper", () => {
    const before = state.created.length;
    const saved = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://node-netlify";
      const first = identity();
      const second = boundSelect();
      expect(first).toBe(second);
      expect(state.created.length).toBe(before + 1);
      expect(state.ended).not.toContain(first);
    } finally {
      if (saved === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = saved;
    }
  });
});
