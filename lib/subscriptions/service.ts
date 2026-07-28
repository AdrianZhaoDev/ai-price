import { confirmationEmail } from "@/lib/email/templates";
import { getEmailTransport } from "@/lib/email/transport";
import { providerCatalog } from "@/lib/data/catalog";
import { hashEmail } from "@/lib/security/tokens";
import { createPendingSubscription } from "./repository";
import { z } from "zod";

type RequestSubscriptionInput = {
  email: string;
  providerId: string;
  planId: string | null;
};

export async function requestPriceSubscription(
  input: RequestSubscriptionInput,
): Promise<{ previewConfirmUrl?: string }> {
  const email = z.email("请输入有效邮箱。").max(254).parse(input.email);
  const provider = providerCatalog.find(
    (candidate) => candidate.id === input.providerId,
  );
  if (!provider) {
    throw new Error("未找到要关注的产品。");
  }

  if (
    input.planId &&
    !provider.offers.some((offer) => offer.planId === input.planId)
  ) {
    throw new Error("该套餐不属于所选产品。");
  }

  const pending = await createPendingSubscription({
    email,
    providerSlug: input.providerId,
    planSlug: input.planId,
  });
  if (!process.env.APP_URL && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required in production.");
  }
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  const confirmUrl = new URL("/api/subscriptions/confirm", baseUrl);
  confirmUrl.searchParams.set("token", pending.confirmationToken);
  const unsubscribeUrl = new URL("/api/subscriptions/unsubscribe", baseUrl);
  unsubscribeUrl.searchParams.set("token", pending.unsubscribeToken);

  const selectedPlan = provider.offers.find(
    (offer) => offer.planId === input.planId,
  );
  const scopeLabel = selectedPlan
    ? `${provider.name} · ${selectedPlan.planName}`
    : provider.name;
  const message = confirmationEmail({
    scopeLabel,
    confirmUrl: confirmUrl.toString(),
    unsubscribeUrl: unsubscribeUrl.toString(),
  });

  await getEmailTransport().sendMail({
    from: process.env.SMTP_FROM ?? "AI Price Atlas <dev@localhost>",
    to: pending.email,
    ...message,
    headers: {
      "X-Entity-Ref-ID": hashEmail(
        `${pending.subscriptionId}:${pending.email}`,
      ),
    },
  });

  return process.env.NODE_ENV === "production"
    ? {}
    : { previewConfirmUrl: confirmUrl.toString() };
}
