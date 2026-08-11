import { CheckCircle2, CircleX, MailCheck } from "lucide-react";
import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/site-header";
import { getMessages, type Locale } from "@/lib/i18n";

export function SubscriptionResultPage({
  status,
  locale = "zh-CN",
}: {
  status?: string;
  locale?: Locale;
}) {
  const messages = getMessages(locale).result;
  const content =
    status === "confirmed"
      ? {
          title: messages.confirmedTitle,
          description: messages.confirmedDescription,
          icon: MailCheck,
        }
      : status === "unsubscribed"
        ? {
            title: messages.unsubscribedTitle,
            description: messages.unsubscribedDescription,
            icon: CheckCircle2,
          }
        : {
            title: messages.invalidTitle,
            description: messages.invalidDescription,
            icon: CircleX,
          };
  const Icon = content.icon;

  return (
    <div className="result-page">
      <SiteHeader locale={locale} showNavigation={false} />
      <main>
        <section className="result-panel">
          <span className="result-icon" aria-hidden="true">
            <Icon size={26} />
          </span>
          <p className="eyebrow">{messages.statusTitle}</p>
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <Link
            href={locale === "en" ? "/en" : "/"}
            className="primary-button pressable"
          >
            {messages.back}
          </Link>
        </section>
      </main>
      <SiteFooter locale={locale} />
    </div>
  );
}
