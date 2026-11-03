export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the URL before releasing its backing bytes.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function downloadBase64(base64: string, filename: string, contentType: string): void {
  const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
  downloadBlob(new Blob([bytes], { type: contentType }), filename);
}
