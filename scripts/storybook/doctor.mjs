import {existsSync,readFileSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const pkg=JSON.parse(readFileSync(resolve(root,"package.json"),"utf8"));
const lock=JSON.parse(readFileSync(resolve(root,"package-lock.json"),"utf8"));
const checks=[];
const playwrightVersions=Object.entries(lock.packages??{}).filter(([path])=>/(?:^|\/)node_modules\/(?:playwright|playwright-core|@playwright\/test)$/.test(path)).map(([,value])=>value.version);
const add=(name,ready,detail)=>checks.push({name,ready,detail});
add("Node runtime",Number(process.versions.node.split(".")[0])>=22,"Detected "+process.versions.node+"; expected Node 22 or later");
for(const dependency of ["storybook","@storybook/react-vite","@storybook/addon-docs","@storybook/addon-a11y","@storybook/addon-vitest","@playwright/test","vitest","typescript"]){
 const declared=pkg.devDependencies?.[dependency]??pkg.dependencies?.[dependency];
 const locked=lock.packages?.["node_modules/"+dependency]?.version;
 const installed=existsSync(resolve(root,"node_modules",dependency,"package.json"));
 add(dependency,Boolean(declared&&locked&&installed),"Declared "+(declared??"missing")+", locked "+(locked??"missing")+", installed "+installed);
}
add("Playwright runtime alignment",playwrightVersions.length===3&&playwrightVersions.every(version=>version===pkg.devDependencies.playwright),"Locked versions: "+playwrightVersions.join(", "));
for(const path of [".storybook/main.ts",".storybook/preview.tsx","storybook.vite.config.ts","vitest.storybook.config.ts","playwright.storybook.config.ts","docs/design-coverage/v61-registry.json"])add(path,existsSync(resolve(root,path)),"Required configuration");
const built=existsSync(resolve(root,"storybook-static/index.json"));
const browserCache=existsSync(resolve(root,"node_modules/@playwright/test/package.json"));
add("Storybook release contract",existsSync(resolve(root,"scripts/storybook/release-contract.mjs")),"Portable exact-commit verification");
add("Curated template assets",existsSync(resolve(root,"public/school-template-previews")),"Explicit reviewed static asset directory");
console.log(JSON.stringify({checks,staticBuildPresent:built,browserPackagePresent:browserCache,visualTokenPresent:Boolean(process.env.CHROMATIC_PROJECT_TOKEN),note:"No database, provider, network, or secret values are read. Presence checks do not prove browser installation or build success."},null,2));
if(checks.some(check=>!check.ready))process.exitCode=1;
