import type {
  getSiteMarketingReleaseOutput, listSiteMarketingPackageReleases,
} from "@/modules/programs/site-marketing-artifacts.functions";
import { packageReleaseIsDownloadableV61 } from "@/domain/marketing-package-release-v61";
import type { MarketingPackageArchiveFile } from "./marketing-output-download";

type SavedPackageRelease = Awaited<ReturnType<typeof listSiteMarketingPackageReleases>>[number];
type SavedOutput = Awaited<ReturnType<typeof getSiteMarketingReleaseOutput>>;

/** Build the exact immutable Release ZIP contents. This is a deterministic
 * projection of server-verified bytes, never a new render from current Brand.
 * Any incomplete or mismatched release fails before a partial ZIP is saved.
 */
export function marketingPackageArchiveFiles(
  release: SavedPackageRelease, outputs: readonly SavedOutput[],
): MarketingPackageArchiveFile[] {
  if (!packageReleaseIsDownloadableV61(release) ||
      outputs.length !== release.outputs.length)
    throw new Error("Complete original Package Release outputs are required");
  const files = release.outputs.map((saved, index) => {
    const output = outputs[index];
    const extension = output?.fileName.split(".").at(-1);
    if (!output || !extension || !/^[a-z0-9]{1,8}$/i.test(extension))
      throw new Error("Invalid saved Package Release filename");
    return { name: saved.format + "." + extension, body: output.content };
  });
  for (let index=0; index<outputs.length; index++) {
    if (release.outputs[index]?.format==="social" && outputs[index]?.plainText)
      files.push({name:"social-caption.txt",body:outputs[index]!.plainText!});
  }
  files.push({name:"package-manifest.json",body:JSON.stringify({
    packageReleaseId:release.id,releaseNumber:release.releaseNumber,
    brandVersionId:release.brandVersionId,sourcePackageRevision:release.packageRevision,
    createdAt:release.createdAt,formats:release.formats,
    outputs:release.outputs.map(item=>({
      id:item.id,format:item.format,templateVersion:item.templateVersion,sha256:item.checksum,
    })),
  },null,2)});
  return files;
}
