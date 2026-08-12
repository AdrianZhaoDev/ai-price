import { ModelReleaseWatchPage } from "@/components/model-release-watch-page";
import { modelReleaseWatchMetadata } from "@/lib/model-release-watch";

export const revalidate = false;

export function generateMetadata() {
  return modelReleaseWatchMetadata("en");
}

export default function EnglishModelReleaseWatchPage() {
  return <ModelReleaseWatchPage locale="en" />;
}
