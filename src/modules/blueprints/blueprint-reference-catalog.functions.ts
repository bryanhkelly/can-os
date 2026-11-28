import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { blueprintReferenceCatalogInputSchema } from "@/domain/blueprint-reference-catalog";
import {exploreCanonicalBlueprintReferencesService} from "./blueprint-catalog-read.server";

/** A private, read-only preview. No Blueprint records or programs are created. */
export const exploreBlueprintReferenceCatalog = createServerFn({ method: "GET" })
  .validator((value: unknown) => blueprintReferenceCatalogInputSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return exploreCanonicalBlueprintReferencesService(getRequest(),data);
  });
