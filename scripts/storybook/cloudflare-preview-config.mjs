// Standalone, static-only Worker. Never inherit production Wrangler settings.
export function cloudflarePreviewConfig(commit){
 if(typeof commit!=="string"||!/^[0-9a-f]{40}$/.test(commit))throw Error("Exact Git commit required");
 return {
  name:"becomuna-storybook",
  compatibility_date:"2026-11-06",
  workers_dev:false,
  preview_urls:false,
  assets:{directory:"./cloudflare-preview-"+commit.slice(0,12),html_handling:"none",not_found_handling:"none"}
 };
}
