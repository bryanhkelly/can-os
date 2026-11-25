import { defineConfig } from "@playwright/test";
import journey from "./playwright.noncredit-pilot-journey.config";

// Reuse the exact isolated runtime and database/fixture guard, not a second
// application configuration. Requires a fresh fixture per run.
export default defineConfig({...journey,testMatch:"noncredit-api-journey.spec.ts"});
