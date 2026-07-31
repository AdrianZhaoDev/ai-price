import Link from "next/link";
import { metadataForDocument } from "@/lib/seo";

export const revalidate = 86400;

export const metadata = metadataForDocument({
  path: "/privacy",
  title: "隐私说明",
  description:
    "了解 AI 价签在价格变化通知中保存哪些邮箱与订阅信息、使用目的、保存期限、安全处理、邮件服务商、退订和删除方式，以及访问官方来源或使用网站分析服务时的数据边界。",
});

export default function PrivacyPage() {
  return (
    <main className="document-page">
      <Link className="document-back" href="/">
        ← 返回价格页
      </Link>
      <p className="eyebrow">隐私说明</p>
      <h1>只保存发送价格通知所必需的信息</h1>
      <p className="document-lead">
        邮箱用于确认订阅、发送价格变化通知和处理退订，不出售，也不用于营销邮件。
      </p>
      <section>
        <h2>保存内容</h2>
        <p>
          系统保存标准化邮箱、邮箱哈希、关注的产品或套餐、确认状态和邮件送达记录。确认与退订令牌只保存不可逆哈希。
        </p>
      </section>
      <section>
        <h2>使用目的与保存期限</h2>
        <p>
          订阅数据只用于确认邮箱所有权、匹配关注的产品或套餐、发送价格变化通知、处理退订和排查邮件送达问题。我们不会把邮箱出售、出租或用于与价格通知无关的营销。
        </p>
        <p>
          有效订阅在用户主动退订前保存。退订后，系统可以保留必要的不可逆哈希和最小送达记录，用于避免误发、处理滥用和证明退订状态；不再需要的数据会按运维周期清理。
        </p>
      </section>
      <section>
        <h2>你的选择</h2>
        <p>
          每封价格通知都带有独立退订链接。完成退订后，系统不再向该关注范围发送邮件。
        </p>
      </section>
      <section>
        <h2>邮件与基础设施服务</h2>
        <p>
          为完成邮件投递、数据库托管、网站加速和安全防护，必要数据可能由受委托的邮件服务商、数据库服务商和
          Cloudflare 等基础设施服务处理。这些服务只获得完成相应功能所需的数据。
        </p>
        <p>
          确认和退订链接中的令牌不会以明文保存。管理员入口、订阅接口和退订结果页被设置为禁止搜索引擎收录，并使用不缓存响应降低敏感信息残留风险。
        </p>
      </section>
      <section>
        <h2>访问数据与 Cookie</h2>
        <p>
          网站可以使用 Cloudflare
          的安全、流量统计和真实用户性能数据来了解可用性、来源趋势及 Core Web
          Vitals。统计用于改进页面速度和发现异常访问，不用于建立广告画像。
        </p>
        <p>
          浏览器的主题偏好可以保存在本地存储中。是否设置安全或分析 Cookie
          取决于基础设施服务的实际功能；我们不会使用第三方广告 Cookie。
        </p>
      </section>
      <section>
        <h2>第三方来源</h2>
        <p>
          点击“官方页面”会离开本站并进入 Apple
          或相应产品官网，之后适用该站点自己的隐私政策。
        </p>
      </section>
      <section>
        <h2>查询、更正与删除</h2>
        <p>
          你可以通过价格页底部的联系入口申请查询、更正或删除订阅相关数据。为防止他人冒用邮箱提出请求，我们可能要求通过原邮箱完成验证。
        </p>
        <p>
          如果只是不再希望接收通知，使用每封通知中的独立退订链接即可立即停止后续发送，不需要登录账号。
        </p>
      </section>
    </main>
  );
}
