import { ModelReleaseWatchPage } from "@/components/model-release-watch-page";
import { modelReleaseWatchMetadata } from "@/lib/model-release-watch";

export const revalidate = false;

export function generateMetadata() {
  return modelReleaseWatchMetadata("zh-CN");
}

export default function ChineseModelReleaseWatchPage() {
  return <ModelReleaseWatchPage locale="zh-CN" />;
}
