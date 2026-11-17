/**
 * Trigger a server-authorized class resource download without replacing the SPA.
 * Cross-origin browsers can ignore the download attribute, so target a new tab
 * rather than navigating away from the student's active class workspace.
 */
export function openClassDownload(downloadUrl: string): void {
  const url = new URL(downloadUrl, window.location.href);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === window.location.origin)) {
    throw new Error("Unsupported class resource download URL");
  }
  const anchor = document.createElement("a");
  anchor.href = url.href;
  anchor.download = "";
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
  }
}
