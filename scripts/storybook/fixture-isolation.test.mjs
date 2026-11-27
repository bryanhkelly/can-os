import {test} from "node:test";
import assert from "node:assert/strict";
import {fixtureImportViolation} from "../../.storybook/fixture-isolation.mjs";
const cases=[
  ["/repo/node_modules/@tanstack/react-start/dist/esm/server.js","server-only application dependency"],
  ["/repo/node_modules/@tanstack/start-server-core/dist/esm/index.js","server-only application dependency"],
  ["/repo/node_modules/@tanstack/react-start-server/dist/esm/index.js","server-only application dependency"],
  ["/repo/node_modules/@tanstack/react-router/dist/esm/index.js",null],
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

import {unavailableRpcAliases,resolveUnavailableRpc,unavailableRpcSource} from "../../.storybook/fixture-unavailable-rpc.mjs";
test("explicit fixture RPC modules reject all calls, never return success",async()=>{
 for(const [path,id] of Object.entries(unavailableRpcAliases)){
  const resolved=resolveUnavailableRpc(id);
  assert.ok(resolved,path);
  const source=unavailableRpcSource(resolved);
  assert.ok(source,path);
  const module=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
  for(const endpoint of Object.values(module))await assert.rejects(endpoint(),/no live service was called/);
 }
 assert.equal(resolveUnavailableRpc("virtual:storybook-unavailable-rpc/modules/unknown.functions"),null);
 assert.equal(unavailableRpcSource("\0virtual:storybook-unavailable-rpc/modules/unknown.functions"),null);
 assert.equal(fixtureImportViolation("/repo/src/modules/identity/platform-owner-delegation.functions.ts"),"unmocked application RPC");
});
