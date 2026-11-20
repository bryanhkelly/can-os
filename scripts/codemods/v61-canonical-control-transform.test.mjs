import assert from "node:assert/strict";
import test from "node:test";
import { migrateV61Source } from "./v61-canonical-control-transform.mjs";

test("canonical controls preserve the native button submit default", () => {
  const source = 'export const Form = () => <form><button className="border" onClick={() => 2 > 1}>Save</button><button type="button" className="underline">Cancel</button></form>;';
  const next = migrateV61Source(source).content;
  assert.match(next, /<Button type="submit" variant="outline"/);
  assert.match(next, /<Button variant="ghost" type="button"/);
  assert.equal((next.match(/<Button\b/g) ?? []).length, 2);
  assert.equal((next.match(/<\/Button>/g) ?? []).length, 2);
  assert.doesNotMatch(next, /<button\b/);
});

test("checkboxes, radios, text inputs and textarea reuse canonical controls", () => {
  const source = 'export const Fields = () => <div><label>Agree<input type="checkbox" checked={true}/></label><input type="radio" name="a"/><input type="date"/><textarea rows={3}/><select><option value="a">A</option></select></div>;';
  const next = migrateV61Source(source).content;
  for (const tag of ["Label", "Checkbox", "Radio", "Input", "Textarea", "Select"])
    assert.match(next, new RegExp("<" + tag + "\\b"));
  assert.doesNotMatch(next, /<input\b/);
  assert.doesNotMatch(next, /<textarea\b/);
  assert.doesNotMatch(next, /<select\b/);
  assert.doesNotMatch(next, /<Checkbox\s+type=/);
  assert.doesNotMatch(next, /<Radio\s+type=/);
});

test("hidden protocol fields stay native and sources are idempotent", () => {
  const source = '"use client";\nimport { Button } from "@/components/ui/button";\nexport const C = () => <div><input type="hidden" name="csrf"/><button type="button">Go</button></div>;';
  const first = migrateV61Source(source);
  assert.match(first.content, /<input type="hidden"/);
  assert.equal((first.content.match(/import \{ Button \}/g) ?? []).length, 1);
  assert.equal(first.content.startsWith('"use client";'), true);
  assert.equal(migrateV61Source(first.content).modified, false);
});

test("rectangular geometry and semantic states are stable", () => {
  const source = 'export const Card = () => <div className="rounded-xl bg-amber-100 border-red-300 text-green-700"><p className="rounded-full bg-blue-600">OK</p></div>;';
  const next = migrateV61Source(source).content;
  assert.doesNotMatch(next, /rounded-/);
  assert.match(next, /bg-warning\/10/);
  assert.match(next, /border-danger\/40/);
  assert.match(next, /text-success/);
  assert.match(next, /bg-info/);
});
