import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/site-header";

vi.mock("@/components/language-switcher", () => ({
  LanguageSwitcher: () => null,
}));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

describe("primary directory navigation", () => {
  it.each(["zh-CN", "en"] as const)(
    "renders ordered, localized links and one active directory in %s",
    (locale) => {
      for (const activeMode of ["channels", "api-transit"] as const) {
        const document = new DOMParser().parseFromString(
          renderToStaticMarkup(
            <SiteHeader locale={locale} activeMode={activeMode} />,
          ),
          "text/html",
        );
        const links = [...document.querySelectorAll("nav a")];
        const prefix = locale === "en" ? "/en" : "";
        expect(links.map((link) => link.getAttribute("href"))).toEqual([
          prefix || "/",
          `${prefix}/china-ai-subscriptions`,
          `${prefix}/api-pricing`,
          `${prefix}/channels`,
          `${prefix}/api-transit`,
        ]);
        expect(links.slice(3).map((link) => link.textContent)).toEqual(
          locale === "en"
            ? ["Channel offers", "API transit"]
            : ["卡网报价", "API 中转"],
        );
        const selected = document.querySelectorAll('nav [aria-current="page"]');
        expect(selected).toHaveLength(1);
        expect(selected[0].getAttribute("data-mode")).toBe(activeMode);
      }
    },
  );

  it("preserves explicitly hidden navigation", () => {
    expect(
      renderToStaticMarkup(<SiteHeader showNavigation={false} />),
    ).not.toContain("desktop-nav");
  });
});
