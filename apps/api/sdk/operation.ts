/** Derive input types from generated OpenAPI, never hand-copy wire schemas. */
export type QueryOf<T>=T extends {parameters:{query?:infer Q}}?NonNullable<Q>:never;
export type JsonBodyOf<T>=T extends {requestBody:{content:{'application/json':infer B}}}?B:never;
/** Null is a legitimate sender approval state. Undefined is never a receipt. */
export function requireApiReceipt<T>(result:{data?:T;error?:unknown;response:Response}):T{
 if(!result.response.ok||result.data===undefined)throw new Error('API operation could not be confirmed ('+result.response.status+')');
 return result.data;
}
