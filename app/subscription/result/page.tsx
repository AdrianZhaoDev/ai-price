import { CheckCircle2, CircleX, MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "订阅状态",
  robots: {
    index: false,
    follow: false,
  },
};

type ResultPageProps = {
  searchParams: Promise<{ status?: string }>;
};

const messages = {
  confirmed: {
    title: "价格关注已生效",
    description: "以后只有价格或套餐发生变化时，我们才会发送邮件。",
    icon: MailCheck,
  },
  unsubscribed: {
    title: "已经退订",
    description: "这项价格关注已关闭，你可以随时重新关注。",
    icon: CheckCircle2,
  },
  invalid: {
    title: "链接已经失效",
    description: "链接可能已使用或过期，请返回价格页重新提交。",
    icon: CircleX,
  },
} as const;

export default async function SubscriptionResultPage({
  searchParams,
}: ResultPageProps) {
  const { status } = await searchParams;
  const content = messages[status as keyof typeof messages] ?? messages.invalid;
  const Icon = content.icon;

  return (
    <main className="result-page">
      <section className="result-panel">
        <span className="result-icon" aria-hidden="true">
          <Icon size={26} />
        </span>
        <p className="eyebrow">AI 价签</p>
        <h1>{content.title}</h1>
        <p>{content.description}</p>
        <Link href="/" className="primary-button pressable">
          返回价格页
        </Link>
      </section>
    </main>
  );
}
