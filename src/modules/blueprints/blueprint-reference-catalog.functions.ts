import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { blueprintReferenceCatalogInputSchema } from "@/domain/blueprint-reference-catalog";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getBlueprintReferenceCatalog } from "./blueprint-reference-catalog.server";

/** A private, read-only preview. No Blueprint records or programs are created. */
export const exploreBlueprintReferenceCatalog = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReferenceCatalogInputSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getBlueprintReferenceCatalog(await getCommandContext(getRequest()), data);
  });
