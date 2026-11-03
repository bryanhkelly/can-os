import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const directory = fileURLToPath(new URL("..", import.meta.url));
const envFile = resolve(directory, ".env.local");
const local = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
const args = process.argv.slice(2);
if (args.some(argument => argument === "--host" || argument.startsWith("--host="))) {
  throw new Error("Local preview must bind to loopback.");
}

const child = spawn(process.execPath, [
  resolve(directory, "node_modules", "vite", "bin", "vite.js"),
  "preview", ...args, "--host", "127.0.0.1",
], {
  cwd: directory,
  env: { ...local, ...process.env, CAN_PUBLIC_SITE_LOCAL_PREVIEW_ENABLED: "true" },
  stdio: "inherit",
});
child.on("error", () => {
  console.error("Unable to start the local Vite preview.");
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
