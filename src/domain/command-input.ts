import type {z} from "zod";
import {DomainError} from "./errors";

/** Only explicitly marked caller validation is a client error. */
export function parseCommandInput<T extends z.ZodTypeAny>(schema:T,input:unknown):z.output<T>{
  const result=schema.safeParse(input);
  if(!result.success)throw new DomainError("VALIDATION_FAILED");
  return result.data;
}
