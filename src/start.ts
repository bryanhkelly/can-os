import { createStart } from "@tanstack/react-start";
import { serverErrorMiddleware } from "@/lib/server-error-middleware";

export const startInstance = createStart(() => ({
  functionMiddleware: [serverErrorMiddleware],
}));
