export function createServerReadFetch(origin: string, incomingRequest: Request, fetchImpl?: typeof globalThis.fetch): (request: Request) => Promise<Response>;
