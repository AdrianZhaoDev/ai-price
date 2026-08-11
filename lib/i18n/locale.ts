import {
  DEFAULT_LOCALE,
  ENGLISH_LOCALE,
  LOCALE_COOKIE,
  type Locale,
} from "./types";

export { DEFAULT_LOCALE, ENGLISH_LOCALE, LOCALE_COOKIE };
export type { Locale } from "./types";

export function isLocale(value: string | null | undefined): value is Locale {
  return value === DEFAULT_LOCALE || value === ENGLISH_LOCALE;
}

export function localeFromPathname(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/")
    ? ENGLISH_LOCALE
    : DEFAULT_LOCALE;
}

export function stripLocalePath(pathname: string): string {
  if (pathname === "/en") return "/";
  if (pathname.startsWith("/en/")) return pathname.slice(3) || "/";
  return pathname || "/";
}

export function localizedPath(locale: Locale, pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const unprefixed = stripLocalePath(path);
  if (locale === ENGLISH_LOCALE) {
    return unprefixed === "/" ? "/en" : `/en${unprefixed}`;
  }
  return unprefixed;
}

export function localizedHref(locale: Locale, href: string): string {
  const url = new URL(href, "https://lowpriceradar.com");
  url.pathname = localizedPath(locale, url.pathname);
  return `${url.pathname}${url.search}${url.hash}`;
}

type LanguagePreference = { tag: string; quality: number; order: number };

export function localeFromAcceptLanguage(
  header: string | null | undefined,
): Locale {
  const preferences: LanguagePreference[] = (header ?? "")
    .split(",")
    .map((part, order) => {
      const [rawTag, ...parameters] = part.trim().toLowerCase().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().startsWith("q="),
      );
      const quality = qualityParameter
        ? Number(qualityParameter.trim().slice(2))
        : 1;
      return {
        tag: rawTag ?? "",
        quality: Number.isFinite(quality) ? Math.max(0, quality) : 0,
        order,
      };
    })
    .filter((preference) => preference.tag && preference.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);

  for (const preference of preferences) {
    if (preference.tag === "en" || preference.tag.startsWith("en-")) {
      return ENGLISH_LOCALE;
    }
    if (preference.tag === "zh" || preference.tag.startsWith("zh-")) {
      return DEFAULT_LOCALE;
    }
  }
  return DEFAULT_LOCALE;
}

export function resolvePreferredLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.cookie)) return input.cookie;
  return localeFromAcceptLanguage(input.acceptLanguage);
}

export function switchLocaleHref(pathname: string, search = "", hash = "") {
  const current = localeFromPathname(pathname);
  const next: Locale =
    current === ENGLISH_LOCALE ? DEFAULT_LOCALE : ENGLISH_LOCALE;
  return `${localizedPath(next, pathname)}${search}${hash}`;
}
