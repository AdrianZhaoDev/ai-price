import {
  reserveEmailDelivery,
  settleEmailDelivery,
} from "@/lib/email/delivery";
import { subscriptionCreatedEmail } from "@/lib/email/templates";
import { getEmailTransport } from "@/lib/email/transport";
import { providerCatalog } from "@/lib/data/catalog";
import { loadProviderCatalog } from "@/lib/pricing/repository";
import { hashEmail, hashValue } from "@/lib/security/tokens";
import { createActiveSubscription } from "./repository";
import { getApplicationBaseUrl } from "./urls";
import { z } from "zod";

type RequestSubscriptionInput = {
  email: string;
  providerId: string;
  planId: string | null;
};

export type SubscriptionEmailTask = {
  subscriptionId: string;
  recipient: string;
  scopeLabel: string;
  unsubscribeUrl: string;
};

export type RequestSubscriptionResult =
  | { status: "already_subscribed" }
  | { status: "subscribed"; emailTask: SubscriptionEmailTask };

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

  const baseUrl = getApplicationBaseUrl();
  const subscription = await createActiveSubscription({
    email,
    providerSlug: input.providerId,
    planSlug: input.planId,
  });
  if (subscription.alreadySubscribed) {
    return { status: "already_subscribed" };
  }

  const unsubscribeUrl = new URL("/api/subscriptions/unsubscribe", baseUrl);
  unsubscribeUrl.searchParams.set("token", subscription.unsubscribeToken);

  const selectedPlan = provider.offers.find(
    (offer) => offer.planId === input.planId,
  );
  const scopeLabel = selectedPlan
    ? `${provider.name} · ${selectedPlan.planName}`
    : provider.name;

  return {
    status: "subscribed",
    emailTask: {
      subscriptionId: subscription.subscriptionId,
      recipient: subscription.email,
      scopeLabel,
      unsubscribeUrl: unsubscribeUrl.toString(),
    },
  };
}

export async function sendSubscriptionCreatedEmail(
  task: SubscriptionEmailTask,
): Promise<void> {
  const deliveryId = await reserveEmailDelivery({
    type: "subscription_created",
    recipient: task.recipient,
    dedupeKey: `subscription-created:${task.subscriptionId}:${hashValue(task.unsubscribeUrl)}`,
  });
  if (!deliveryId) return;

  try {
    const result = await getEmailTransport().sendMail({
      from: process.env.SMTP_FROM ?? "AI Price Atlas <dev@localhost>",
      to: task.recipient,
      ...subscriptionCreatedEmail({
        scopeLabel: task.scopeLabel,
        unsubscribeUrl: task.unsubscribeUrl,
      }),
      headers: {
        "X-Entity-Ref-ID": hashEmail(
          `${task.subscriptionId}:${task.recipient}`,
        ),
      },
    });
    await settleEmailDelivery(deliveryId, {
      status: "sent",
      providerMessageId: result.messageId,
    });
  } catch (error) {
    await settleEmailDelivery(deliveryId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
