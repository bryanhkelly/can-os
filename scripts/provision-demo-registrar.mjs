import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

if (existsSync(".env.local")) loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.argv.includes("--apply")) {
  throw new Error("Pass --apply to explicitly provision only the synthetic demo registrar");
}
const { provisionDemoSchoolAccess } = await import("../src/modules/_demo/provision-demo-registrar.ts");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  console.log(JSON.stringify(await provisionDemoSchoolAccess(drizzle(pool), process.env), null, 2));
} finally {
  await pool.end();
}
