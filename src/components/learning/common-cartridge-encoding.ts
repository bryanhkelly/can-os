/** Converts a validated, size-limited Common Cartridge package to a server transport string. */
export async function encodeCommonCartridge(file: File, maxBytes = 2_000_000): Promise<string> {
  if (file.size > maxBytes) {
    throw new Error("Use a package of 2 MB or smaller for direct validation.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}
