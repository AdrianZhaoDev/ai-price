import Link from "next/link";
import { metadataForDocument } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = metadataForDocument({
  path: "/methodology",
  title: "官方价格采集与核验方法",
  description:
    "了解 Low Price Radar 如何从 App Store、产品官网、帮助中心和开放平台采集 AI 订阅及 API 价格，以及数据核验、异常隔离、汇率换算、更新频率、来源追溯和纠错处理规则。",
});

export default function MethodologyPage() {
  return (
    <main className="document-page">
      <Link className="document-back" href="/">
        ← 返回价格页
      </Link>
      <p className="eyebrow">方法与边界</p>
      <h1>官方价格怎样进入 Low Price Radar</h1>
      <p className="document-lead">
        我们只发布可以追溯到官方页面的价格。国际订阅读取 Apple App Store 的公开
        storefront 页面；国内价格读取产品官网、帮助中心或开放平台文档。
      </p>
      <section>
        <h2>每 4 小时核验一次</h2>
        <p>
          价格与汇率任务通常每 4
          小时同轮运行。网页本身不临时抓取第三方页面，只读取已经完成核验的记录。
        </p>
      </section>
      <section>
        <h2>来源必须能够追溯</h2>
        <p>
          每一组公开价格都关联产品官方页面、官方帮助中心、开放平台计费文档或
          Apple App Store
          公开接口。第三方媒体、搜索摘要和转售平台只能用于发现线索，不能直接成为报价依据。
        </p>
        <p>
          页面展示的“官方页面”链接用于复核原币金额、计费单位和适用条件。不同账号等级、税区、促销资格或结算渠道可能产生额外差异，最终价格仍以实际结账页为准。
        </p>
      </section>
      <section>
        <h2>异常不会覆盖旧值</h2>
        <p>
          页面结构变化、价格缺失、套餐数量异常减少或访问被限制时，本轮结果会被拒绝。最后一次有效价格继续展示并标记为“可能过期”。
        </p>
        <p>
          每次核验还会记录 HTTP status、source URL、currency、billing
          period、observed at、parser version
          和连续失败次数。这些字段用于区分网络波动、来源改版、计费单位变化和真实价格调整，避免把采集故障误判成降价或涨价。
        </p>
      </section>
      <section>
        <h2>先标准化，再比较</h2>
        <p>
          订阅价格保留官方币种、计费周期和地区，同时换算人民币参考价；API
          报价保留官方原币价、模型、价格层级、缓存输入、非缓存输入、输出及官方计费单位，并统一换算为人民币排序。只有标准实时、短上下文、付费且按百万
          tokens 计价的数据进入排行榜。
        </p>
        <p>
          Batch、Flex、Priority、长上下文、免费层和非 Token
          项目可以保留在明细中，但不参与排行。汇率带有独立观察时间；没有实时或历史汇率时，不发布对应外币来源。
        </p>
      </section>
      <section>
        <h2>换算只是参考</h2>
        <p>
          原币金额和官方来源优先。人民币换算不包含支付渠道、税费、银行卡汇率或账号资格差异，最终以实际结账页为准。
        </p>
      </section>
      <section>
        <h2>更新时间与过期标记</h2>
        <p>
          每次成功采集都会记录观察时间和来源状态。来源连续失败时，最后一次有效价格可以继续展示，但会标记为“可能过期”，避免一次网络故障把正确数据删除。
        </p>
        <p>
          页面通常在采集完成后的缓存刷新周期内更新。若官方页面已变化而本站尚未同步，请同时提供产品名称、页面地址、看到的价格和适用地区，便于复核。
        </p>
      </section>
      <section id="data-corrections">
        <h2>数据纠错流程</h2>
        <p>
          发现价格、计费单位、模型名称或官方链接不准确时，可以使用价格页底部的“数据纠错”入口联系我们。我们会重新检查官方来源，不依据无法复核的截图直接覆盖现有记录。
        </p>
        <p>
          核验通过后，修正会进入下一次公开更新；如果官方资料存在冲突，页面会优先保留原币金额和限制说明，并暂缓参与跨平台排名。
        </p>
      </section>
    </main>
  );
}
