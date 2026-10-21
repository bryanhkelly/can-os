/** Curriculum private assets are separate from enrollment uploads and never public R2 objects. */
export const curriculumPdfKeyPattern = /^learning\/supplements\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
export const maxCurriculumPdfBytes = 10 * 1024 * 1024;

/** Check the PDF signature in a bounded byte sample; not a full malware or PDF safety scan. */
export function hasPdfMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

export function isCurriculumPdfKeyForResource(key: string, resourceId: string): boolean {
  return curriculumPdfKeyPattern.test(key) && key.startsWith(`learning/supplements/${resourceId}/`);
}
