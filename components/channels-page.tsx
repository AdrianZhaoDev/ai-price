import Image from "next/image";
import type { Locale } from "@/lib/i18n";
import { absoluteUrl, metadataForDocument } from "@/lib/seo";
import { SiteFooter, SiteHeader } from "./site-header";
import { TransitSubmissionForm } from "./transit-submission-form";
import styles from "./channels-empty.module.css";

export type PublicDirectorySearchParams = Promise<
  Record<string, string | string[] | undefined>
>;

export const channelsPageMetadata = (locale: Locale) =>
  metadataForDocument({
    path: "/channels",
    title: locale === "en" ? "AI Channel Offers" : "AI 卡网报价",
    description:
      locale === "en"
        ? "No verified AI channel offers are listed yet. Channel operators can submit a public website and a short introduction for manual review."
        : "当前暂无已核验的 AI 卡网报价。卡网运营方可提交公开网站与一句话介绍，完成邮箱验证后进入人工审核。",
    locale,
    keywords:
      locale === "en"
        ? ["AI channel offers", "channel directory submission"]
        : ["AI 卡网报价", "卡网收录申请"],
  });

export async function ChannelsPage({
  locale,
}: {
  locale: Locale;
  searchParams: PublicDirectorySearchParams;
}) {
  const en = locale === "en";
  const path = en ? "/en/channels" : "/channels";

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {en ? "Skip to content" : "跳转到正文"}
      </a>
      <SiteHeader locale={locale} activeMode="channels" />
      <main id="main-content" className={`main-content ${styles.page}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebPage",
              name: en ? "AI channel offers" : "AI 卡网报价",
              url: absoluteUrl(path),
              inLanguage: en ? "en" : "zh-CN",
              description: en
                ? "No verified channel offers are currently listed."
                : "当前暂无已核验的卡网报价。",
            }).replace(/</g, "\\u003c"),
          }}
        />

        <section className={styles.emptyState} aria-labelledby="channels-title">
          <div className={styles.copy}>
            <p className="eyebrow">
              <span className="eyebrow-line" aria-hidden="true" />
              {en ? "Channel offers" : "卡网报价"}
            </p>
            <h1 id="channels-title">
              {en ? "No channel offers yet." : "还没有卡网报价。"}
            </h1>
            <p>
              {en
                ? "We only publish public, reviewable information. A channel operator can submit a website for manual review below."
                : "这里只发布公开且可复核的信息。卡网运营方可在下方提交网站，审核通过后再收录。"}
            </p>
            <a className={styles.cta} href="#channel-submission">
              {en ? "Submit a channel" : "提交收录"}
            </a>
          </div>
          <div className={styles.visual} aria-hidden="true">
            <Image
              src="/images/channels-empty.webp"
              alt=""
              width={1024}
              height={1024}
              sizes="(max-width: 720px) 84vw, 430px"
              priority
            />
          </div>
        </section>

        <section id="channel-submission" className={styles.submission}>
          <div className={styles.submissionIntro}>
            <p className={styles.kicker}>{en ? "Manual review" : "人工审核"}</p>
            <h2>{en ? "List your channel" : "申请收录卡网"}</h2>
            <p>
              {en
                ? "Verify your email, then send the public website and a one-sentence introduction. We never fetch or publish a submitted URL automatically."
                : "验证邮箱后，提交公开网站和一句话介绍。用户提交的网址不会被自动抓取或直接公开。"}
            </p>
          </div>
          <TransitSubmissionForm locale={locale} directory="channels" />
        </section>
      </main>
      <SiteFooter
        locale={locale}
        description={
          en
            ? "A manually reviewed directory for public AI channel offers."
            : "人工审核的公开 AI 卡网报价目录。"
        }
      />
    </div>
  );
}
