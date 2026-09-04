import { PriceChangesPage } from "@/components/price-changes-page";
import { metadataForDocument } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = metadataForDocument({
  path: "/price-changes",
  title: "AI 订阅价格变化与历史记录",
  description:
    "查看经过两轮采集确认的 AI 订阅原币价格变化，保留官方来源与确认时间，提供 RSS、CSV 和 JSON。",
  locale: "zh-CN",
  keywords: ["AI 订阅价格变化", "AI 会员价格历史", "订阅价格 RSS"],
});
export default function Page() {
  return <PriceChangesPage locale="zh-CN" />;
}
