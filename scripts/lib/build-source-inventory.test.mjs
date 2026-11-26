import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { collectBuildSourceFiles } from "./build-source-inventory.mjs";

const extensions = [".ts", ".tsx", ".mjs"];
async function fixture(t, paths) {
  const root = await mkdtemp(join(tmpdir(), "build-source-inventory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const path of paths) {
    const file = join(root, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, "");
  }
  return root;
}
const names = (root, files) => files.map(file => relative(root, file).replaceAll("\\", "/")).sort();

test("includes nested Storybook and Netlify inputs plus root build configs", async t => {
  const expected = [".storybook/main.ts", ".storybook/decorators/preview.tsx", "netlify/functions/send.ts",
    "scripts/check.mjs", "src/components/story.stories.tsx", "vite.cloudflare.config.ts"].sort();
  const root = await fixture(t, [...expected, "tests/unit/example.test.ts"]);
  assert.deepEqual(names(root, await collectBuildSourceFiles(root, extensions)), expected);
  assert.deepEqual(names(root, await collectBuildSourceFiles(root, extensions, true)),
    [...expected, "tests/unit/example.test.ts"].sort());
});

test("skips generated and dependency inputs, and permits absent optional folders", async t => {
  const root = await fixture(t, ["src/routeTree.gen.ts", "src/page.tsx", "scripts/check.mjs",
    "src/node_modules/pkg/index.ts", "src/dist/bundle.ts", "src/storybook-static/story.ts",
    "scripts/.netlify/functions/bundle.ts", "README.md"]);
  assert.deepEqual(names(root, await collectBuildSourceFiles(root, extensions)), ["scripts/check.mjs", "src/page.tsx"]);
});

test("does not silently skip required source directories", async t => {
  const root = await fixture(t, ["src/page.tsx"]);
  await assert.rejects(collectBuildSourceFiles(root, extensions), { code: "ENOENT" });
});
