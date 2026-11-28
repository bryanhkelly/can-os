import {chromium} from "playwright";
let browser;
try{
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage();
 await page.setContent("<h1>Becomuna Storybook browser check</h1>");
 if(await page.locator("h1").textContent()!=="Becomuna Storybook browser check")throw Error("Chromium rendering check failed");
 console.log("Chromium launched and rendered successfully without privileged system installation.");
}catch(error){
 console.error("Chromium could not launch in this build environment. The Storybook browser gate cannot be skipped. Use an acceptance runner with the required browser libraries if they are missing.");
 console.error(error instanceof Error?error.message:String(error));
 process.exitCode=1;
}finally{await browser?.close();}
