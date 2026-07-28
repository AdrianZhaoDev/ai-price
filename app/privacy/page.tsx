import Link from "next/link";

export const metadata = {
  title: "隐私 · AI 价签",
};

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
        <h2>你的选择</h2>
        <p>
          每封价格通知都带有独立退订链接。完成退订后，系统不再向该关注范围发送邮件。
        </p>
      </section>
      <section>
        <h2>第三方来源</h2>
        <p>
          点击“官方页面”会离开本站并进入 Apple
          或相应产品官网，之后适用该站点自己的隐私政策。
        </p>
      </section>
    </main>
  );
}
