import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

if (existsSync(".env.local")) loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
if (!process.argv.includes("--apply")) {
  throw new Error("Pass --apply to explicitly provision synthetic demo school access");
}
const { provisionDemoSchoolAccess, provisionDemoSiteAdmin, provisionDemoRoomFacilitator } = await import("../src/modules/_demo/provision-demo-registrar.ts");
if (process.argv.includes("--admin-only") && process.argv.includes("--room-facilitator-only"))
  throw new Error("Select one scoped provisioning option");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const provision = process.argv.includes("--room-facilitator-only") ? provisionDemoRoomFacilitator
    : process.argv.includes("--admin-only") ? provisionDemoSiteAdmin : provisionDemoSchoolAccess;
  console.log(JSON.stringify(await provision(drizzle(pool), process.env), null, 2));
} finally {
  await pool.end();
}
