import Link from "next/link";
import { modes } from "@/lib/data/catalog";
import { DEFAULT_LOCALE, getMessages, type Locale } from "@/lib/i18n";
import type { PriceMode } from "@/lib/pricing/types";
import { modeHref } from "@/lib/seo";
import { BrandMark } from "./brand-mark";
import { LanguageSwitcher } from "./language-switcher";
import { PrivacyPreferencesButton } from "./privacy-preferences-button";
import { ThemeToggle } from "./theme-toggle";

type SiteHeaderProps = {
  locale?: Locale;
  activeMode?: PriceMode | "channels" | "api-transit";
  syncLabel?: string;
  syncTitle?: string;
  showSync?: boolean;
  showNavigation?: boolean;
  ariaHidden?: boolean;
};

export function SiteHeader({
  locale = DEFAULT_LOCALE,
  activeMode,
  syncLabel,
  syncTitle,
  showSync = false,
  showNavigation = true,
  ariaHidden,
}: SiteHeaderProps) {
  const messages = getMessages(locale);
  const resolvedSyncLabel = syncLabel ?? messages.common.syncEveryFourHours;
  const resolvedSyncTitle = syncTitle ?? messages.common.syncTitle;

  return (
    <header className="site-header" aria-hidden={ariaHidden || undefined}>
      <Link
        href={modeHref("global", locale)}
        className="brand"
        aria-label={messages.brand.homeLabel}
      >
        <BrandMark />
        <span className="brand-copy">
          <strong>
            Low Price <span className="brand-name-accent">Radar</span>
          </strong>
          <small>{messages.brand.tagline}</small>
        </span>
      </Link>

      {showNavigation ? (
        <nav className="desktop-nav" aria-label={messages.nav.ariaLabel}>
          {modes.map((mode) => {
            const label = messages.nav.modes[mode.id];
            return (
              <Link
                key={mode.id}
                href={modeHref(mode.id, locale)}
                prefetch={mode.id === "api" ? false : undefined}
                className="nav-item pressable"
                data-mode={mode.id}
                aria-current={activeMode === mode.id ? "page" : undefined}
                aria-label={label}
              >
                {label}
                {mode.id === "api" ? (
                  <span className="nav-label-compact" aria-hidden="true">
                    {messages.nav.apiCompact}
                  </span>
                ) : null}
                {mode.id === "api" ? (
                  <span className="nav-hot-badge" aria-hidden="true">
                    {messages.nav.hot}
                  </span>
                ) : null}
              </Link>
            );
          })}
          {(["channels", "api-transit"] as const).map((directory) => (
            <Link
              key={directory}
              href={`${locale === "en" ? "/en" : ""}/${directory}`}
              prefetch={false}
              className="nav-item pressable"
              data-mode={directory}
              aria-current={activeMode === directory ? "page" : undefined}
              aria-label={messages.nav.directories[directory]}
            >
              {messages.nav.directories[directory]}
            </Link>
          ))}
        </nav>
      ) : null}

      <div className="header-actions">
        {showSync ? (
          <div className="sync-state" title={resolvedSyncTitle}>
            <span className="sync-dot" />
            {resolvedSyncLabel}
          </div>
        ) : null}
        <LanguageSwitcher locale={locale} />
        <ThemeToggle locale={locale} />
      </div>
    </header>
  );
}

type SiteFooterProps = {
  locale?: Locale;
  description?: string;
  includeCorrection?: boolean;
  contactEmail?: string;
  includeModelSource?: boolean;
  ariaHidden?: boolean;
};

export function SiteFooter({
  locale = DEFAULT_LOCALE,
  description,
  includeCorrection = false,
  contactEmail,
  includeModelSource = false,
  ariaHidden,
}: SiteFooterProps) {
  const messages = getMessages(locale);
  const footerDescription = description ?? messages.pricing.footerDescription;
  const methodologyHref = locale === "en" ? "/en/methodology" : "/methodology";
  const privacyHref = locale === "en" ? "/en/privacy" : "/privacy";

  return (
    <footer className="site-footer" aria-hidden={ariaHidden || undefined}>
      <div>
        <strong>Low Price Radar</strong>
        <p>{footerDescription}</p>
      </div>
      <div className="footer-links">
        <Link href={locale === "en" ? "/en/price-changes" : "/price-changes"}>
          {locale === "en" ? "Price changes" : "价格变化"}
        </Link>
        <Link href={locale === "en" ? "/en/channels" : "/channels"}>
          {locale === "en" ? "Channel offers" : "卡网报价"}
        </Link>
        <Link href={locale === "en" ? "/en/api-transit" : "/api-transit"}>
          {locale === "en" ? "API transit" : "API 中转"}
        </Link>
        <Link href={methodologyHref}>{messages.common.methodology}</Link>
        <Link href={privacyHref}>{messages.common.privacy}</Link>
        <PrivacyPreferencesButton
          label={messages.common.managePrivacyPreferences}
        />
        {includeModelSource ? (
          <a
            href="https://github.com/anomalyco/models.dev"
            target="_blank"
            rel="noreferrer"
          >
            {messages.apiCatalog.sourceLink}
          </a>
        ) : null}
        {includeCorrection ? (
          <a
            href={
              contactEmail
                ? `mailto:${contactEmail}?subject=${encodeURIComponent(messages.pricing.dataCorrection)}`
                : `${methodologyHref}#data-corrections`
            }
          >
            {messages.pricing.dataCorrection}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
