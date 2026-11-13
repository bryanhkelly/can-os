import { z } from "zod";
import { AuthorizationError, type CommandContext } from "./command-context";

const organizationIdSchema = z.string().uuid();

export function programCatalogDatabaseRole(context: Pick<CommandContext, "scope">): string {
  const organizationIds = context.scope.organizationIds;
  if (!organizationIds || organizationIds.length !== 1) {
    throw new AuthorizationError("single verified program-catalog Organization scope");
  }

  const organizationId = organizationIdSchema.safeParse(organizationIds[0]);
  if (!organizationId.success) {
    throw new AuthorizationError("verified program-catalog Organization scope");
  }

  return `can_v30_program_catalog_${organizationId.data.replaceAll("-", "").toLowerCase()}`;
}
