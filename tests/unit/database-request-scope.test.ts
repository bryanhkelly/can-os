import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  nextId: 0,
  created: [] as number[],
  ended: [] as number[],
  connectionStrings: [] as string[],
}));

vi.mock("@neondatabase/serverless", () => ({
  Pool: class MockPool {
    readonly id: number;
    constructor({ connectionString }: { connectionString: string }) {
      this.id = ++state.nextId;
      state.created.push(this.id);
      state.connectionStrings.push(connectionString);
    }
    async end() { state.ended.push(this.id); }
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

import { db, withRequestDatabase } from "@/db/client";

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
