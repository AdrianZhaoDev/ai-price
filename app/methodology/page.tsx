import Link from "next/link";

export const metadata = {
  title: "采集方法 · AI 价签",
};

export default function MethodologyPage() {
  return (
    <main className="document-page">
      <Link className="document-back" href="/">
        ← 返回价格页
      </Link>
      <p className="eyebrow">方法与边界</p>
      <h1>价格怎样进入 AI 价签</h1>
      <p className="document-lead">
        我们只发布可以追溯到官方页面的价格。国际订阅读取 Apple App Store 的公开
        storefront 页面；国内价格读取产品官网、帮助中心或开放平台文档。
      </p>
      <section>
        <h2>每天两次</h2>
        <p>
          采集任务在北京时间 06:00 和 18:00
          运行。网页本身不临时抓取第三方页面，只读取已经完成核验的记录。
        </p>
      </section>
      <section>
        <h2>异常不会覆盖旧值</h2>
        <p>
          页面结构变化、价格缺失、套餐数量异常减少或访问被限制时，本轮结果会被拒绝。最后一次有效价格继续展示并标记为“可能过期”。
        </p>
      </section>
      <section>
        <h2>换算只是参考</h2>
        <p>
          原币金额和官方来源优先。人民币换算不包含支付渠道、税费、银行卡汇率或账号资格差异，最终以实际结账页为准。
        </p>
      </section>
    </main>
  );
}
