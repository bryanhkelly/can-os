import { pgSchema } from "drizzle-orm/pg-core";

export const educationV30 = pgSchema("education_v30");
export const educationV30Secure = pgSchema("education_v30_secure");

export type { JsonPrimitive, JsonValue, JsonObject } from "@/domain/json-types";
