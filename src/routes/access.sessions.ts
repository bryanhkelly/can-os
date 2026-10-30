import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { clearSessionCookieHeader } from "@/domain/access-tokens";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { listAccountSessions, revokeOwnedAccountSessions } from "@/modules/identity/account-sessions.server";

const actionSchema = z.discriminatedUnion("kind", [
 z.object({ kind: z.literal("one"), sessionId: z.string().uuid() }).strict(),
 z.object({ kind: z.literal("all") }).strict(),
]);

/** Account-scoped security surface. The caller cannot choose an account ID. */
export const Route = createFileRoute("/access/sessions")({
 server: { handlers: {
  GET: async ({ request }) => {
   try {
    const actor = await getCommandContext(request);
    const sessions = await listAccountSessions(actor);
    return Response.json({ sessions }, { headers: { "Cache-Control": "private, no-store" } });
   } catch (error) {
    return Response.json(
     { error: error instanceof AuthorizationError ? "Unauthorized" : "Unable to load sessions" },
     { status: error instanceof AuthorizationError ? 401 : 500, headers: { "Cache-Control": "no-store" } },
    );
   }
  },
  POST: async ({ request }) => {
   if (new URL(request.url).origin !== request.headers.get("origin"))
    return Response.json({ error: "Invalid request origin" }, { status: 403, headers: { "Cache-Control": "no-store" } });
   try {
    const actor = await getCommandContext(request);
    const command = actionSchema.parse(await request.json());
    const result = await revokeOwnedAccountSessions(actor, command);
    return Response.json(result, {
     headers: {
      "Cache-Control": "no-store",
      ...(result.currentRevoked ? { "Set-Cookie": clearSessionCookieHeader() } : {}),
     },
    });
   } catch (error) {
    return Response.json({
     error: error instanceof AuthorizationError ? "Unauthorized" :
      error instanceof z.ZodError ? "Invalid session request" : "Unable to revoke sessions",
    }, {
     status: error instanceof AuthorizationError ? 401 :
      error instanceof z.ZodError ? 400 : 500,
     headers: { "Cache-Control": "no-store" },
    });
   }
  },
 } },
});
