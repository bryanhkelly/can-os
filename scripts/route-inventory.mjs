import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const normalizeRoute = route => route.replace(/_(?=\/|$)/g, "").replace(/\/$/, "") || "/";

function manifestMap(entries, key) {
  return new Map(entries.map(entry => [key(entry), entry]));
}

export function createRouteInventory(root = process.cwd()) {
  const routeDirectory = path.join(root, "src/routes");
  const routeTree = readFileSync(path.join(root, "src/routeTree.gen.ts"), "utf8");
  const registeredFiles = new Set([...routeTree.matchAll(/from '\.\/routes\/([^']+)'/g)]
    .map(match => `src/routes/${match[1]}`));
  const contractManifest = JSON.parse(readFileSync(path.join(root, "docs/platform-route-contracts.json"), "utf8"));
  const fixtureManifest = JSON.parse(readFileSync(path.join(root, "scripts/seeds/fixture-manifest.json"), "utf8"));
  const smokeManifest = JSON.parse(readFileSync(path.join(root, "tests/e2e/route-smoke-manifest.json"), "utf8"));
  const navigationSource = readFileSync(path.join(root, "src/components/shell/route-navigation.ts"), "utf8");
  const navigationPaths = new Set([...navigationSource.matchAll(/^\s*"([^"\n]+)":\s*(?:page|hidden|endpoint|publicPage)\(/gm)]
    .map(match => normalizeRoute(match[1])));
  const contracts = manifestMap(contractManifest.routes, entry => entry.file);
  const fixtureRoutes = new Set(Object.keys(fixtureManifest.routes ?? {}).map(normalizeRoute));
  const signedOutRoutes = new Set((smokeManifest.signedOutRoutes ?? []).map(normalizeRoute));
  const authenticatedRoutes = [
    ...(smokeManifest.authenticatedPersonas ?? []).map(entry => entry.destination),
    ...(smokeManifest.authenticatedDynamicRoutes ?? []).map(entry => entry.route),
  ].map(normalizeRoute);

  return readdirSync(routeDirectory).filter(file => /\.tsx?$/.test(file)).sort().map(file => {
    const relativeFile = `src/routes/${file}`;
    const routeBase = file.replace(/\.tsx?$/, "");
    const registered = registeredFiles.has(`src/routes/${routeBase}`);
    const source = readFileSync(path.join(routeDirectory, file), "utf8");
    const declared = source.match(/createFileRoute\(\s*["'`]([^"'`]+)["'`]\s*\)/)?.[1];
    const rootRoute = file === "__root.tsx";
    const route = declared ? normalizeRoute(declared) : rootRoute ? "<root>" : null;
    const kind = rootRoute || /\bcomponent\s*:\s*Outlet\b/.test(source) ? "layout"
      : /\bcomponent\s*:/.test(source) ? "page"
        : /server\s*:\s*\{\s*handlers\s*:/.test(source) ? "handler"
          : /\bredirect\(/.test(source) || /beforeLoad\s*:\s*\(\)\s*=>\s*\{?\s*throw\s+redirect/.test(source)
            ? "redirect" : "non-page";
    const contract = contracts.get(relativeFile);

    return {
      file: relativeFile,
      route,
      kind,
      dynamicParameters: route ? [...route.matchAll(/\$([^/]+)/g)].map(match => match[1]) : [],
      owner: contract?.owner ?? null,
      declared: Boolean(declared || rootRoute),
      registered,
      routeNavigationDeclared: route ? navigationPaths.has(route) : false,
      testCoverage: {
        routeContractDeclared: Boolean(contract),
        fixtureDeclared: Boolean(route && fixtureRoutes.has(route)),
        signedOutSmokeDeclared: Boolean(route && signedOutRoutes.has(route)),
        authenticatedPersonaSmokeDeclared: Boolean(route && authenticatedRoutes.some(target =>
          target === route || target.replace(/\$[^/]+/g, "record") === route.replace(/\$[^/]+/g, "record"))),
      },
    };
  });
}