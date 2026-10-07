import { PriceChangesPage } from "@/components/price-changes-page";
import { metadataForDocument } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = metadataForDocument({
  path: "/price-changes",
  title: "AI 订阅价格变化与历史记录",
  description:
    "查看经过两轮采集确认的 AI 订阅价格变化与历史记录，核对产品、地区、套餐周期、调整前后原币金额及确认时间。每条记录保留官方来源，并提供 RSS 订阅、CSV 和 JSON 数据入口；人民币汇率波动不作为订阅原价调整记录。",
  locale: "zh-CN",
  keywords: ["AI 订阅价格变化", "AI 会员价格历史", "订阅价格 RSS"],
});
export default function Page() {
  return <PriceChangesPage locale="zh-CN" />;
}
