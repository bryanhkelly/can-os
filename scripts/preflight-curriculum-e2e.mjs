/** Refuse curriculum E2E writes unless the target is explicitly isolated. */
const test=process.env.CAN_CURRICULUM_TEST_DATABASE_URL ?? process.env.TEST_DATABASE_URL;
const host=(url)=>new URL(url).hostname.replace(/-pooler(?=\.)/,"").toLowerCase();
if(process.env.NODE_ENV!=="test"||process.env.APP_ENV!=="test"||
 process.env.CAN_TEST_DB_WRITES_ENABLED!=="true"||!test||
 !process.env.CAN_APPLICATION_DB_HOST||process.env.DATABASE_URL!==test||
 host(test)===process.env.CAN_APPLICATION_DB_HOST.replace(/-pooler(?=\.)/,"").toLowerCase())
 throw new Error("REFUSED: curriculum browser tests require a distinct disposable Neon branch and explicit isolated-write guard.");
console.log("Curriculum acceptance isolation preflight passed; no database changes.");
