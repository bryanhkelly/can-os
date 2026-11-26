import {test} from "node:test";
import assert from "node:assert/strict";
import {fixtureImportViolation} from "../../.storybook/fixture-isolation.mjs";
const cases=[
  [
    "/repo/src/modules/x/x.functions.ts",
    "unmocked application RPC"
  ],
  [
    "C:\\repo\\src\\db\\client.ts?import",
    "server-only application code"
  ],
  [
    "/repo/src/modules/x/__mocks__/x.functions.ts",
    null
  ],
  [
    "/repo/node_modules/foo/src/server/index.ts",
    null
  ],
  [
    "/repo/src/components/example.tsx",
    null
  ],
  [
    "/repo/src/modules/x/read.server.ts",
    "server-only application code"
  ]
];
for(const [path,expected] of cases)test("module boundary: "+path,()=>assert.equal(fixtureImportViolation(path),expected));
