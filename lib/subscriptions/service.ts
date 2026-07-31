import {
  reserveEmailDelivery,
  settleEmailDelivery,
  type EmailDeliveryReservation,
} from "@/lib/email/delivery";
import { subscriptionCreatedEmail } from "@/lib/email/templates";
import { getEmailTransport } from "@/lib/email/transport";
import { providerCatalog } from "@/lib/data/catalog";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import { hashEmail } from "@/lib/security/tokens";
import { modeHref } from "@/lib/seo";
import {
  claimSubscriptionCreatedEmail,
  createActiveSubscription,
  createUnsubscribeToken,
  listPendingSubscriptionEmailIds,
  settleSubscriptionCreatedEmail,
} from "./repository";
import { getApplicationBaseUrl } from "./urls";
import {
  API_RANKING_PLAN_SLUG,
  API_RANKING_PROVIDER_SLUG,
  isApiRankingScope,
} from "./scopes";
import { z } from "zod";

type RequestSubscriptionInput = {
  email: string;
  providerId: string;
  planId: string | null;
};

export type RequestSubscriptionResult = {
  notificationId?: string;
};

export async function requestPriceSubscription(
  input: RequestSubscriptionInput,
): Promise<RequestSubscriptionResult> {
  const email = z.email("请输入有效邮箱。").max(254).parse(input.email);
  const catalogProvider = providerCatalog.find(
    (candidate) => candidate.id === input.providerId,
  );
  if (!catalogProvider) {
    throw new Error("未找到要关注的产品。");
  }

  const [liveProvider] = await loadProviderCatalog(
    catalogProvider.mode,
    input.providerId,
  );
  const provider = liveProvider ?? catalogProvider;

  if (
    input.planId &&
    !provider.offers.some((offer) => offer.planId === input.planId)
  ) {
    throw new Error("该套餐不属于所选产品。");
  }

  const subscription = await createActiveSubscription({
    email,
    providerSlug: input.providerId,
    planSlug: input.planId,
  });

  return {
    notificationId: subscription.emailNotificationPending
      ? subscription.subscriptionId
      : undefined,
  };
}

export async function requestApiRankingSubscription(
  emailInput: string,
): Promise<RequestSubscriptionResult> {
  const email = z.email("请输入有效邮箱。").max(254).parse(emailInput);
  const subscription = await createActiveSubscription({
    email,
    providerSlug: API_RANKING_PROVIDER_SLUG,
    planSlug: API_RANKING_PLAN_SLUG,
  });
  return {
    notificationId: subscription.emailNotificationPending
      ? subscription.subscriptionId
      : undefined,
  };
}

export async function sendSubscriptionCreatedEmail(
  subscriptionId: string,
): Promise<boolean> {
  const claim = await claimSubscriptionCreatedEmail(subscriptionId);
  if (!claim) return false;

  let deliveryId: EmailDeliveryReservation | null = null;

  try {
    const rankingScope = isApiRankingScope(claim.providerSlug, claim.planSlug);
    const catalogProvider = providerCatalog.find(
      (candidate) => candidate.id === claim.providerSlug,
    );
    const [liveProvider] = catalogProvider
      ? await loadProviderCatalog(catalogProvider.mode, claim.providerSlug)
      : [];
    const provider = liveProvider ?? catalogProvider;
    const selectedPlan = provider?.offers.find(
      (offer) => offer.planId === claim.planSlug,
    );
    const scopeLabel = rankingScope
      ? "API 价格排行榜"
      : provider && selectedPlan
        ? `${provider.name} · ${selectedPlan.planName}`
        : (provider?.name ?? claim.providerSlug);

    const unsubscribeToken = await createUnsubscribeToken(claim.subscriptionId);
    const unsubscribeUrl = new URL(
      "/api/subscriptions/unsubscribe",
      getApplicationBaseUrl(),
    );
    unsubscribeUrl.searchParams.set("token", unsubscribeToken);
    const viewPath = rankingScope
      ? "/api-pricing#api-ranking"
      : modeHref(provider?.mode ?? "global");
    const viewUrl = new URL(viewPath, getApplicationBaseUrl()).toString();
    const ctaLabel = rankingScope
      ? "查看完整榜单"
      : provider?.mode === "china-subscription"
        ? "看看还有更便宜的订阅吗？"
        : provider?.mode === "api"
          ? "查看当前模型价格"
          : "查看当前最低价格";

    deliveryId = await reserveEmailDelivery({
      type: "subscription_created",
      recipient: claim.email,
      dedupeKey: `subscription-created:${claim.subscriptionId}:attempt:${claim.attempt}`,
    });
    if (!deliveryId) {
      throw new Error("Subscription email delivery attempt was not reserved.");
    }

    const result = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM ?? "AI Price Atlas <dev@localhost>",
      to: claim.email,
      ...subscriptionCreatedEmail({
        scopeLabel,
        viewUrl,
        ctaLabel,
        unsubscribeUrl: unsubscribeUrl.toString(),
      }),
      headers: {
        "X-Entity-Ref-ID": hashEmail(`${claim.subscriptionId}:${claim.email}`),
      },
    });
    await settleEmailDelivery(deliveryId, {
      status: "sent",
      providerMessageId: result.messageId,
    });
    await settleSubscriptionCreatedEmail(claim.subscriptionId, {
      status: "sent",
      attempt: claim.attempt,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (deliveryId) {
      await settleEmailDelivery(deliveryId, {
        status: "failed",
        error: message,
      });
    }
    await settleSubscriptionCreatedEmail(claim.subscriptionId, {
      status: "failed",
      attempt: claim.attempt,
    });
    throw error;
  }
}

export async function deliverPendingSubscriptionCreatedEmails(
  limit = 20,
): Promise<{ attempted: number; sent: number; failed: number }> {
  const subscriptionIds = await listPendingSubscriptionEmailIds(limit);
  let sent = 0;
  let failed = 0;

  for (const subscriptionId of subscriptionIds) {
    try {
      if (await sendSubscriptionCreatedEmail(subscriptionId)) sent += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    attempted: subscriptionIds.length,
    sent,
    failed,
  };
}
