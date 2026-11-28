export function createSameOriginFetch(origin:string,fetchImpl?:typeof globalThis.fetch):(request:Request)=>Promise<Response>;
