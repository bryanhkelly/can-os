import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { verifyFullFlowNeonBranch } from "./verify-fullflow-neon-branch.mjs";

export function developmentEnvironment(directory, inherited = process.env) {
  const envFile = resolve(directory, ".env.local");
  const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
  const env = { ...local, ...inherited };
  if (env.NODE_ENV === "production") throw new Error("Local development must not run in production mode.");
  if (!env.DATABASE_URL) throw new Error("Configure DATABASE_URL in FullFlow's ignored .env.local or the environment.");
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
  return { ...env, NODE_ENV: "development" };
}

async function main() {
  const directory = fileURLToPath(new URL("..", import.meta.url));
  const env = developmentEnvironment(directory);
  try {
    await verifyFullFlowNeonBranch(env.DATABASE_URL);
  } catch {
    throw new Error("Development database verification failed. Use the dedicated nonproduction FullFlow Neon branch.");
  }
  console.log("Verified FullFlow development database and session configuration.");
  const args = process.argv.slice(2);
  if (args.includes("--check")) return;
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
