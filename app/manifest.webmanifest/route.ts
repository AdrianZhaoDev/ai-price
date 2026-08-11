import { chineseManifest } from "@/lib/site-manifests";

export function GET() {
  return Response.json(chineseManifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
