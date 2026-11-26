import {defineConfig} from "@playwright/test";
import {viewports} from "./.storybook/viewports";

const cases=[
 {device:"compact",theme:"light"},{device:"phone",theme:"dark"},{device:"tablet",theme:"site"},
 {device:"laptop",theme:"light"},{device:"desktop",theme:"dark"},{device:"wide",theme:"site"},
] as const;
export default defineConfig({
 testDir:"./scripts/storybook",
 testMatch:"**/*.browser.spec.ts",
 fullyParallel:true,
 workers:process.env.CI?2:undefined,
 retries:process.env.CI?1:0,
 timeout:30_000,
 reporter:[["list"],["html",{outputFolder:"acceptance-artifacts/storybook-browser-report",open:"never"}]],
 outputDir:"acceptance-artifacts/storybook-browser-results",
 use:{baseURL:"http://127.0.0.1:6007",browserName:"chromium",trace:"retain-on-failure",screenshot:"only-on-failure",reducedMotion:"reduce",locale:"en-US",timezoneId:"UTC"},
 projects:cases.map(({device,theme})=>({name:device+"-"+theme,use:{viewport:{width:parseInt(viewports[device].styles.width,10),height:parseInt(viewports[device].styles.height,10)},},metadata:{theme}})),
 webServer:{command:"npx --no-install vite preview --config storybook.vite.config.ts --outDir storybook-static --host 127.0.0.1 --port 6007 --strictPort",url:"http://127.0.0.1:6007/index.json",reuseExistingServer:false,timeout:30_000},
});
