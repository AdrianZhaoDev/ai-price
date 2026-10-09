import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChannelsPage } from "@/components/channels-page";

describe("channel empty state", () => {
  it.each([
    ["zh-CN", "还没有卡网报价。", "申请收录卡网"],
    ["en", "No channel offers yet.", "List your channel"],
  ] as const)(
    "renders the %s empty state and submission form",
    async (locale, heading, submissionHeading) => {
      const page = await ChannelsPage({
        locale,
        searchParams: Promise.resolve({ q: "ignored" }),
      });
      const document = new DOMParser().parseFromString(
        renderToStaticMarkup(page),
        "text/html",
      );

      expect(document.querySelector("h1")?.textContent).toBe(heading);
      expect(document.body.textContent).toContain(submissionHeading);
      expect(document.querySelector("img")?.getAttribute("src")).toContain(
        "channels-empty.webp",
      );
      expect(document.querySelector("table")).toBeNull();
      expect(document.querySelector("[data-channel-offer]")).toBeNull();
      expect(
        document.querySelector('script[type="application/ld+json"]')
          ?.textContent,
      ).toContain('"WebPage"');
    },
  );
});
