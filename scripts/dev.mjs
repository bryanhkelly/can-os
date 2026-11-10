import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { prepareTemplateImages } from "./prepare-template-images.mjs";
import { neon } from "@neondatabase/serverless";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";
import { verifyAdmissionsNeonBranch } from "./verify-admissions-neon-branch.mjs";

export function developmentEnvironment(directory, inherited = process.env) {
  const envFile = resolve(directory, ".env.local");
  const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const env = { ...local, ...inherited };
  if (env.NODE_ENV === "production") throw new Error("Local development must not run in production mode.");
  if (!env.DATABASE_URL) throw new Error("Configure DATABASE_URL in .env.local or the environment.");
  let database;
  try {
    database = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(database.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL.");
  }
  if (!env.CAN_ACCESS_TOKEN_PEPPER || env.CAN_ACCESS_TOKEN_PEPPER.length < 32) {
    throw new Error("Configure CAN_ACCESS_TOKEN_PEPPER with at least 32 characters before starting.");
  }
  return {
    ...env,
    NODE_ENV: env.APP_ENV === "test" ? "test" : "development",
    CAN_PUBLIC_SITE_LOCAL_PREVIEW_ENABLED: "true",
    CAN_PUBLIC_SITE_LOCAL_PREVIEW_WRITES_ENABLED: "true",
  };
}

export function assertDevelopmentNeonIdentity(identity, env) {
  const project = env.CAN_DEV_NEON_PROJECT_ID;
  const branch = env.CAN_DEV_NEON_BRANCH_ID;
  if (!project || !branch || !/^br-[a-z0-9-]+$/.test(branch)) {
    throw new Error("Configure CAN_DEV_NEON_PROJECT_ID and CAN_DEV_NEON_BRANCH_ID for the explicitly approved development database.");
  }
  if (!identity || identity.project_id !== project || identity.branch_id !== branch) {
    throw new Error("Development database refused: Postgres-attested Neon identity differs from the explicitly approved target.");
  }
}

export async function verifyDevelopmentDatabase(env) {
  if (env.APP_ENV === "test") {
    const branch = env.CAN_ADMISSIONS_TEST_BRANCH_ID ?? env.CAN_E2E_TEST_BRANCH_ID;
    if (branch) {
      return verifyAdmissionsNeonBranch({ ...env, CAN_ADMISSIONS_TEST_BRANCH_ID: branch });
    }
    return verifyFullFlowNeonBranch(env.DATABASE_URL);
  }
  // Validate declarations before opening a database connection.
  assertDevelopmentNeonIdentity({
    project_id: env.CAN_DEV_NEON_PROJECT_ID, branch_id: env.CAN_DEV_NEON_BRANCH_ID,
  }, env);
  const query = neon(env.DATABASE_URL);
  const [identity] = await query`
    SELECT current_setting('neon.project_id', true) AS project_id,
           current_setting('neon.branch_id', true) AS branch_id
  `;
  assertDevelopmentNeonIdentity(identity, env);
  return identity;
}

async function main() {
  const directory = fileURLToPath(new URL("..", import.meta.url));
  const env = developmentEnvironment(directory);
  try {
    await verifyDevelopmentDatabase(env);
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`Development database verification failed.${detail}`, { cause: error });
  }
  console.log(env.APP_ENV === "test"
    ? "Verified isolated test database and session configuration."
    : "Verified explicitly configured development database. Ordinary UI writes persist in this database.");
  const args = process.argv.slice(2);
  if (args.includes("--check")) return;
  await prepareTemplateImages();
  const child = spawn(process.execPath, [
    resolve(directory, "node_modules", "vite", "bin", "vite.js"),
    "dev", "--host", "127.0.0.1", ...args,
  ], { cwd: directory, env, stdio: "inherit" });
  child.on("error", () => {
    console.error("Unable to start the local Vite server.");
    process.exitCode = 1;
  });
  child.on("exit", (code, signal) => {
    process.exitCode = code ?? (signal ? 1 : 0);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
