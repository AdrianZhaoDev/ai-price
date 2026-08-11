import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_LOCALE,
  ENGLISH_LOCALE,
  LOCALE_COOKIE,
  localeFromPathname,
  localizedPath,
  resolvePreferredLocale,
} from "@/lib/i18n";

const excludedPrefixes = [
  "/_next/",
  "/assets/",
  "/api/",
  "/admin",
  "/pricing-data/",
  "/sitemaps/",
];

const excludedPaths = new Set([
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon.svg",
  "/og.png",
  "/a73d0c70889247afad00e059e00716e8.txt",
]);

function shouldSkip(pathname: string): boolean {
  return (
    excludedPaths.has(pathname) ||
    excludedPrefixes.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix),
    )
  );
}

function withLocaleHeader(
  request: NextRequest,
  locale: typeof DEFAULT_LOCALE | typeof ENGLISH_LOCALE,
) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-ai-price-locale", locale);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Vary", "Accept-Language, Cookie");
  return response;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/en/assets" || pathname.startsWith("/en/assets/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(3) || "/assets";
    return NextResponse.rewrite(url);
  }
  if (shouldSkip(pathname)) return NextResponse.next();

  const pathLocale = localeFromPathname(pathname);
  if (pathLocale === ENGLISH_LOCALE) {
    return withLocaleHeader(request, ENGLISH_LOCALE);
  }

  const preferredLocale = resolvePreferredLocale({
    cookie: request.cookies.get(LOCALE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language"),
  });
  if (preferredLocale === ENGLISH_LOCALE) {
    const url = request.nextUrl.clone();
    url.pathname = localizedPath(ENGLISH_LOCALE, pathname);
    const response = NextResponse.redirect(url);
    response.headers.set("Vary", "Accept-Language, Cookie");
    return response;
  }

  return withLocaleHeader(request, DEFAULT_LOCALE);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
