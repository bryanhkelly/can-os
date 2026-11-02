import { createMiddleware, createStart } from "@tanstack/react-start";
import { toClientSafeServerError } from "@/lib/server-error-middleware";

const clientSafeFunctionErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    throw toClientSafeServerError(error);
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [clientSafeFunctionErrors],
}));
