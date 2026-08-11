"use client";

import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  switchLocaleHref,
  type Locale,
} from "@/lib/i18n";
import { getMessages } from "@/lib/i18n/messages";

export function LanguageSwitcher({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const nextLocale = locale === "en" ? "zh-CN" : "en";

  function switchLanguage() {
    const nextHref = switchLocaleHref(
      window.location.pathname,
      window.location.search,
      window.location.hash,
    );
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Max-Age=${LOCALE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
    window.location.href = nextHref;
  }

  return (
    <button
      type="button"
      className="language-switcher pressable"
      onClick={switchLanguage}
      aria-label={messages.nav.switchTo}
      title={messages.nav.switchTo}
    >
      <span aria-hidden="true">{messages.common.languageButton}</span>
    </button>
  );
}
