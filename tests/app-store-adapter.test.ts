import { describe, expect, it } from "vitest";
import {
  appStoreHealthCheck,
  appStorefronts,
  canonicalAppStorePlan,
  parseAppStoreHtml,
} from "@/lib/collectors/adapters/app-store";

const fixture = `
  <dl>
    <dt>In-App Purchases</dt>
    <dd><details><ul>
      <li><div class="text-pair"><span>ChatGPT Plus</span><span>$19.99</span></div></li>
      <li><div class="text-pair"><span>$200.00</span><span>ChatGPT Pro 20x</span></div></li>
      <li><div class="text-pair"><span>ChatGPT Plus</span><span>$200.00</span></div></li>
      <li><div class="text-pair"><span>$4.00</span><span>100 Credits</span></div></li>
    </ul></details></dd>
  </dl>
`;

describe("App Store adapter", () => {
  it("covers 46 storefronts including the additional low-price regions", () => {
    expect(appStorefronts).toHaveLength(46);
    expect(new Set(appStorefronts.map((store) => store.code)).size).toBe(46);
    expect(appStorefronts.map((store) => store.code)).toEqual(
      expect.arrayContaining(["ph", "pk", "vn", "id", "eg", "ar"]),
    );
  });

  it("parses public in-app purchase pairs", () => {
    const offers = parseAppStoreHtml({
      html: fixture,
      providerSlug: "chatgpt",
      storefront: appStorefronts[0],
      sourceUrl: "https://apps.apple.com/us/app/id6448311069",
      observedAt: "2026-07-23T10:00:00.000Z",
    });
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({
      canonicalPlanSlug: "chatgpt-plus-monthly",
      amountMinor: 1999,
      currency: "USD",
      storefront: "US",
      status: "verified",
    });
    expect(offers[1]).toMatchObject({
      rawPlanName: "ChatGPT Pro 20x",
      canonicalPlanSlug: "chatgpt-pro-20x-monthly",
      amountMinor: 20000,
    });
    expect(offers[2]).toMatchObject({
      canonicalPlanSlug: "chatgpt-plus-annual",
      billingPeriod: "year",
      amountMinor: 20000,
    });
    expect(appStoreHealthCheck(offers).ok).toBe(true);
  });

  it("treats a 404 storefront as unavailable, not a parser failure", () => {
    const offers = parseAppStoreHtml({
      html: "Not Found",
      status: 404,
      providerSlug: "chatgpt",
      storefront: appStorefronts.find((store) => store.code === "cn")!,
      sourceUrl: "https://apps.apple.com/cn/app/id6448311069",
      observedAt: "2026-07-23T10:00:00.000Z",
    });
    expect(offers[0]).toMatchObject({
      amountMinor: null,
      displayPrice: "此区未上架",
      status: "unpublished",
    });
    expect(appStoreHealthCheck(offers).ok).toBe(true);
  });

  it("accepts localized prices with spaced thousands", () => {
    const offers = parseAppStoreHtml({
      html: `<dl><dt>Köp inuti app</dt><dd><div class="text-pair"><span>ChatGPT Pro 20x</span><span>1 295,00 kr</span></div></dd></dl>`,
      providerSlug: "chatgpt",
      storefront: appStorefronts.find((store) => store.code === "se")!,
      sourceUrl: "https://apps.apple.com/se/app/id6448311069",
      observedAt: "2026-07-23T10:00:00.000Z",
    });
    expect(offers[0]).toMatchObject({
      rawPlanName: "ChatGPT Pro 20x",
      currency: "SEK",
      amountMinor: 129500,
    });
  });

  it("parses Vietnamese suffixes and Indonesian ribu abbreviations", () => {
    const vietnam = parseAppStoreHtml({
      html: `<dl><dt>Mua In-App</dt><dd><div class="text-pair"><span>ChatGPT Plus</span><span>499.000đ</span></div></dd></dl>`,
      providerSlug: "chatgpt",
      storefront: appStorefronts.find((store) => store.code === "vn")!,
      sourceUrl: "https://apps.apple.com/vn/app/id6448311069",
      observedAt: "2026-07-23T10:00:00.000Z",
    });
    const indonesia = parseAppStoreHtml({
      html: `<dl><dt>Pembelian In-App</dt><dd><div class="text-pair"><span>ChatGPT Plus</span><span>Rp 349ribu</span></div></dd></dl>`,
      providerSlug: "chatgpt",
      storefront: appStorefronts.find((store) => store.code === "id")!,
      sourceUrl: "https://apps.apple.com/id/app/id6448311069",
      observedAt: "2026-07-23T10:00:00.000Z",
    });
    expect(vietnam[0].amountMinor).toBe(499000);
    expect(indonesia[0].amountMinor).toBe(349000);
  });

  it("keeps Gemini storage tiers distinct and removes duplicate monthly prices", () => {
    const offers = parseAppStoreHtml({
      html: `<dl><dt>In-App Purchases</dt><dd>
        <div class="text-pair"><span>Google AI Plus (400 GB)</span><span>₺199,99</span></div>
        <div class="text-pair"><span>Google AI Plus (2 TB)</span><span>₺204,99</span></div>
        <div class="text-pair"><span>Google AI Pro (5 TB)</span><span>₺719,99</span></div>
        <div class="text-pair"><span>Google AI Pro (5 TB)</span><span>₺359,99</span></div>
      </dd></dl>`,
      providerSlug: "gemini",
      storefront: appStorefronts.find((store) => store.code === "tr")!,
      sourceUrl: "https://apps.apple.com/tr/app/id6477489729",
      observedAt: "2026-07-23T10:00:00.000Z",
    });

    expect(offers).toHaveLength(3);
    expect(
      offers.map((offer) => [offer.canonicalPlanSlug, offer.amountMinor]),
    ).toEqual([
      ["google-ai-plus-400gb-monthly", 19999],
      ["google-ai-plus-2tb-monthly", 20499],
      ["google-ai-pro-5tb-monthly", 35999],
    ]);
    expect(appStoreHealthCheck(offers).ok).toBe(true);
  });

  it("keeps SuperGrok Plus distinct from SuperGrok", () => {
    expect(canonicalAppStorePlan("grok", "SuperGrok")).toBe(
      "supergrok-monthly",
    );
    expect(canonicalAppStorePlan("grok", "SuperGrok Plus")).toBe(
      "supergrok-plus-monthly",
    );
  });

  it("reports empty and invalid collections", () => {
    expect(appStoreHealthCheck([]).code).toBe("EMPTY_RESULT");
    expect(
      appStoreHealthCheck([
        {
          ...parseAppStoreHtml({
            html: fixture,
            providerSlug: "chatgpt",
            storefront: appStorefronts[0],
            sourceUrl: "https://example.com",
            observedAt: new Date().toISOString(),
          })[0],
          amountMinor: -1,
        },
      ]).code,
    ).toBe("MISSING_PRICE");
    expect(canonicalAppStorePlan("unknown", "New Plan")).toBe(
      "unknown-new-plan",
    );
    const validOffer = parseAppStoreHtml({
      html: fixture,
      providerSlug: "chatgpt",
      storefront: appStorefronts[0],
      sourceUrl: "https://example.com",
      observedAt: new Date().toISOString(),
    })[0];
    expect(appStoreHealthCheck([validOffer, validOffer])).toMatchObject({
      code: "STRUCTURE_CHANGED",
      details: {
        duplicateIdentities: [
          {
            offers: [
              { rawPlanName: "ChatGPT Plus", displayPrice: "$19.99" },
              { rawPlanName: "ChatGPT Plus", displayPrice: "$19.99" },
            ],
          },
        ],
      },
    });
  });
});
