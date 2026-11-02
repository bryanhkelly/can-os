import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
// Plain Node ESM script without type declarations; imported for its pure core.
// @ts-ignore
import { applySeedChain, buildSeedBatch, resolveSeedChain } from "../../scripts/apply-seed-chain.mjs";

const script = "scripts/apply-seed-chain.mjs";
const validEnv = {
  ...process.env,
  APP_ENV: "test",
  NODE_ENV: "test",
  CAN_TEST_DB_WRITES_ENABLED: "true",
  TEST_DATABASE_URL: "postgresql://synthetic:secret@ep-disposable.example.test/seeds",
  DATABASE_URL: "",
  CAN_APPLICATION_DB_HOST: "ep-production.example.test",
};

function run(args: string[], environment: Record<string, string>) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...validEnv, ...environment },
  });
}

describe("manifest seed chain resolution", () => {
  it("orders base seeds first, then route seeds in declaration order, deduplicated", () => {
    const chain = resolveSeedChain({
      baseSeeds: ["base-a.sql", "base-b.sql"],
      routes: {
        "/one": { seeds: ["x.sql", "y.sql"] },
        "/two": { seeds: ["y.sql", "z.sql"] },
        "/three": { seeds: ["base-a.sql", "x.sql"] },
      },
    });
    expect(chain.map((entry: { file: string }) => entry.file)).toEqual([
      "base-a.sql", "base-b.sql", "x.sql", "y.sql", "z.sql",
    ]);
    expect(chain[0].base).toBe(true);
    expect(chain[2].routes).toEqual(["/one", "/three"]);
    expect(chain[3].routes).toEqual(["/one", "/two"]);
  });

  it("matches the committed manifest: base seeds lead and every declared seed appears once", () => {
    const manifest = JSON.parse(readFileSync("scripts/seeds/fixture-manifest.json", "utf8"));
    const chain = resolveSeedChain(manifest);
    expect(chain.slice(0, 2).map((entry: { file: string }) => entry.file)).toEqual(manifest.baseSeeds);
    const files = chain.map((entry: { file: string }) => entry.file);
    expect(new Set(files).size).toBe(files.length);
    const declared = new Set<string>(manifest.baseSeeds);
    for (const entry of Object.values(manifest.routes) as { seeds?: string[] }[]) {
      for (const seed of entry.seeds ?? []) declared.add(seed);
    }
    expect(files.sort()).toEqual([...declared].sort());
  });
});

describe("seed batch construction", () => {
  it("wraps plain seed files in an explicit transaction", () => {
    const batch = buildSeedBatch("INSERT INTO a VALUES (1);\nINSERT INTO b VALUES (2);");
    expect(batch).toBe("BEGIN;\nINSERT INTO a VALUES (1);\nINSERT INTO b VALUES (2);\nCOMMIT;");
  });

  it("leaves self-transacting seed files in charge of their own transaction", () => {
    const sql = "BEGIN;\nINSERT INTO a VALUES (1);\nCOMMIT;";
    expect(buildSeedBatch(sql)).toBe(sql);
  });

  it("sets the synthetic seed authorization on the same session when a seed requires it", () => {
    const sql = readFileSync("scripts/seeds/valor-curriculum-marketplace.sql", "utf8");
    const batch: string = buildSeedBatch(sql);
    expect(batch.startsWith("SET can.seed_authorized = 'valorschool';\n")).toBe(true);
    // The file's own BEGIN/COMMIT governs; no extra transaction wrapper.
    expect(batch.match(/^BEGIN;/gm)).toHaveLength(1);
    expect(batch.indexOf("SET can.seed_authorized")).toBeLessThan(batch.indexOf("\nBEGIN;"));
  });
});

describe("seed chain execution", () => {
  const chain = [
    { file: "student-s1-s4.sql", base: true, routes: [] },
    { file: "gf2-admissions-test.sql", base: false, routes: ["/admissions"] },
    { file: "gf26-study-groups.sql", base: false, routes: ["/groups"] },
  ];

  it("applies files in manifest order, each as one transactional batch", async () => {
    const calls: string[] = [];
    const applied = await applySeedChain({
      chain,
      log: () => {},
      execute: async (sql: string) => {
        calls.push(sql);
      },
    });
    expect(applied).toEqual(chain.map((entry) => entry.file));
    expect(calls).toHaveLength(3);
    expect(calls[0]).toContain("INSERT INTO jurisdictions");
    expect(calls[1]).toContain("BEGIN;");
    expect(calls[1]).toContain("COMMIT;");
  });

  it("dry-run applies nothing and never touches the database layer", async () => {
    const execute = vi.fn();
    const log = vi.fn();
    const applied = await applySeedChain({ chain, dryRun: true, execute, log });
    expect(execute).not.toHaveBeenCalled();
    expect(applied).toEqual([]);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[0]?.[0]).toContain("[dry-run] would apply 1/3 student-s1-s4.sql");
  });

  it("stops at the first failing file and names it", async () => {
    const calls: string[] = [];
    await expect(applySeedChain({
      chain,
      log: () => {},
      execute: async (sql: string) => {
        calls.push(sql);
        if (calls.length === 2) throw new Error("duplicate key value");
      },
    })).rejects.toThrow("Seed chain failed at gf2-admissions-test.sql (2 of 3); 1 applied, 1 not attempted. Cause: duplicate key value");
    expect(calls).toHaveLength(2);
  });
});

describe("seed executor guards (fail-closed)", () => {
  it("refuses without explicit fixture-write approval", () => {
    const result = run(["--dry-run"], { CAN_TEST_DB_WRITES_ENABLED: "false" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("CAN_TEST_DB_WRITES_ENABLED");
    expect(result.stderr).not.toContain("secret");
  });

  it("refuses outside APP_ENV=test", () => {
    const result = run(["--dry-run"], { APP_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("APP_ENV=test");
  });

  it("refuses in production mode", () => {
    const result = run(["--dry-run"], { NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("never run fixtures in production");
  });

  it("refuses when the target host matches the production application host, pooler-normalized", () => {
    const result = run(["--dry-run"], {
      TEST_DATABASE_URL: "postgresql://synthetic:secret@ep-production-pooler.example.test/seeds",
      CAN_APPLICATION_DB_HOST: "ep-production.example.test",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not use the configured application database host");
  });

  it("refuses when the test target equals the application DATABASE_URL endpoint", () => {
    const result = run(["--dry-run"], {
      DATABASE_URL: "postgresql://app:secret@ep-disposable.example.test/seeds",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("must not use the application database endpoint");
  });

  it("refuses an invalid target connection string without leaking credentials", () => {
    const result = run(["--dry-run"], { TEST_DATABASE_URL: "not-a-url" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Seed chain refused");
    expect(result.stderr).not.toContain("secret");
  });

  it("dry-run lists the full manifest chain without a database connection", () => {
    const result = run(["--dry-run"], {});
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("[dry-run] would apply 1/");
    expect(result.stdout).toContain("student-s1-s4.sql");
    expect(result.stdout).toContain("valor-curriculum-marketplace.sql");
    expect(result.stdout).toContain("no database writes performed");
    expect(result.stdout).not.toContain("secret");
  });

  it("rejects unknown arguments", () => {
    const result = run(["--force"], {});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unrecognized argument");
  });
});
