import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { strictRpcShellViolations } from "./strict-rpc-shell.mjs";

const valid = `import { createServerFn } from "@tanstack/react-start";
import { input } from "./sample.inputs";
export const publish = createServerFn({ method: "POST" })
  .validator((raw: unknown) => input.parse(raw))
  .handler(async ({ data }) => {
    const implementation = await import("./sample.server");
    return implementation.publish(data);
  });`;
const inspect = source => strictRpcShellViolations(ts.createSourceFile("sample.functions.ts", source, ts.ScriptTarget.Latest, true), "sample");
test("accepts the governed shell independent of formatting", () => {
  assert.equal(inspect(valid).length, 0);
  assert.equal(inspect(valid.replaceAll('"', "'").replaceAll(";", "").replaceAll("implementation", "service")).length, 0);
});
test("rejects privileged static imports and raw exports", () => {
  assert.ok(inspect(valid + '\nimport {db} from "@/db/client";').length);
  assert.ok(inspect(valid + '\nexport async function hidden() {}').length);
});
test("rejects missing RPC validation, unrelated targets and mismatched methods", () => {
  assert.ok(inspect(valid.replace(".validator((raw: unknown) => input.parse(raw))", "")).length);
  assert.ok(inspect(valid.replace("./sample.server", "./other.server")).length);
  assert.ok(inspect(valid.replace("implementation.publish(data)", "implementation.other(data)")).length);
  assert.ok(inspect(valid.replace("implementation.publish(data)", "implementation.publish({})")).length);
  assert.ok(inspect(valid.replace("return implementation.publish(data);", "console.log(data); return implementation.publish(data);")).length);
});
test("reports malformed shell declarations without crashing", () => {
  assert.ok(inspect("export const publish = undefined;").length);
  assert.ok(inspect("export const publish: unknown;").length);
  assert.ok(inspect(valid.replace("async ({ data })", "({ data })")).length);
});

test("permits only explicitly registered no-input GET operations", () => {
  const noInput = `import { createServerFn } from "@tanstack/react-start";
export const list = createServerFn({ method: "GET" }).handler(async () => {
  const service = await import("./sample.server");
  return service.list();
});`;
  const check = source => strictRpcShellViolations(ts.createSourceFile("sample.functions.ts", source, ts.ScriptTarget.Latest, true), "sample", ["list"]);
  assert.ok(inspect(noInput).length);
  assert.equal(check(noInput).length, 0);
  assert.ok(check(noInput.replace('"GET"', '"POST"')).length);
  assert.ok(check(noInput.replace("service.list()", "service.list(data)")).length);
  assert.ok(check(noInput.replace("async ()", "async ({ data })")).length);
});
