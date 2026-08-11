import { providerCatalog } from "@/lib/data/catalog";
import {
  formatOfferAnnotation,
  formatOfferDisplayPrice,
  formatOfferPlanName,
  formatOfferUnit,
  formatProviderDescription,
} from "@/lib/pricing/format";
import { describe, expect, it } from "vitest";

const hanCharacters = /[\u3400-\u9fff]/;

describe("English pricing data display", () => {
  it("removes Chinese from explanatory fields across the full catalog", () => {
    for (const provider of providerCatalog) {
      const description = formatProviderDescription(provider, "en").replace(
        provider.name,
        "",
      );
      expect(description, `${provider.id} description`).not.toMatch(
        hanCharacters,
      );

      for (const offer of provider.offers) {
        if (offer.modelName && offer.priceType) {
          expect(
            formatOfferPlanName(offer, "en").replace(offer.modelName, ""),
            `${provider.id}/${offer.id} plan label`,
          ).not.toMatch(hanCharacters);
        }
        expect(
          formatOfferDisplayPrice(offer, "en"),
          `${provider.id}/${offer.id} display price`,
        ).not.toMatch(hanCharacters);
        expect(
          formatOfferUnit(offer.unit, "en"),
          `${provider.id}/${offer.id} unit`,
        ).not.toMatch(hanCharacters);
        expect(
          formatOfferAnnotation(offer, provider, "en").replace(
            provider.name,
            "",
          ),
          `${provider.id}/${offer.id} annotation`,
        ).not.toMatch(hanCharacters);
      }
    }
  });

  it("keeps product plans and official source names unchanged", () => {
    const stepfun = providerCatalog.find(
      (provider) => provider.id === "stepfun-subscription",
    )!;
    expect(stepfun.offers[0]?.planName).toBe("尝鲜周卡");
    expect(stepfun.sourceLabel).toBe("阶跃星辰官方订阅页");
  });
});
