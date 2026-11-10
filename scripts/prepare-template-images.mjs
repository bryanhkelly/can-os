import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));
const manifest = JSON.parse(await readFile(new URL("../src/domain/template-sample-assets.json", import.meta.url), "utf8"));

export async function prepareTemplateImages({ outputDirectory = publicDirectory } = {}) {
  const root = resolve(outputDirectory);
  const results = [];
  for (const asset of manifest.files.filter(file => file.preview_only === "no" &&
    ["hero", "story_01"].includes(file.role) && file.width >= 1000)) {
    if (!/^school-template-previews\/v1\/[a-z-]+\/(?:hero|story_01)\.jpg$/.test(asset.key))
      throw new Error("Invalid template default image path");
    const source = await readFile(resolve(publicDirectory, asset.key));
    if (createHash("sha256").update(source).digest("hex") !== asset.sha256)
      throw new Error(`Template image hash mismatch: ${asset.key}`);
    const metadata = await sharp(source).metadata();
    if (metadata.width !== asset.width || metadata.height !== asset.height)
      throw new Error(`Template image dimensions mismatch: ${asset.key}`);
    const variants = [];
    for (const width of manifest.responsive_widths) {
      if (!Number.isInteger(width) || width < 1) throw new Error("Invalid responsive image width");
      if (width >= asset.width) continue;
      const key = asset.key.replace(/\.jpg$/, `-${width}.webp`);
      const output = resolve(root, key);
      if (!output.startsWith(root + sep)) throw new Error("Template image output escaped its directory");
      await mkdir(dirname(output), { recursive: true });
      await sharp(source).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toFile(output);
      variants.push({ key, width });
    }
    results.push({ key: asset.key, width: asset.width, height: asset.height, variants });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareTemplateImages().then(results => {
    console.log(`Validated ${results.length} template originals and generated ${results.reduce((total, image) => total + image.variants.length, 0)} responsive variants.`);
  }).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}