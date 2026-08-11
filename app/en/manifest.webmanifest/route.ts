import { englishManifest } from "@/lib/site-manifests";

export function GET() {
  return Response.json(englishManifest, {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
