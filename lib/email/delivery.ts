import { getDatabase, isDatabaseConfigured } from "@/lib/db/client";
import { emailDeliveries } from "@/lib/db/schema";
import { hashEmail } from "@/lib/security/tokens";
import { eq } from "drizzle-orm";

export async function reserveEmailDelivery(input: {
  type: string;
  recipient: string;
  dedupeKey: string;
}): Promise<string | null> {
  if (!isDatabaseConfigured()) return crypto.randomUUID();
  const [delivery] = await getDatabase()
    .insert(emailDeliveries)
    .values({
      messageType: input.type,
      recipientHash: hashEmail(input.recipient),
      dedupeKey: input.dedupeKey,
      status: "sending",
    })
    .onConflictDoNothing()
    .returning({ id: emailDeliveries.id });
  if (delivery) return delivery.id;

  const [existing] = await getDatabase()
    .select({
      id: emailDeliveries.id,
      status: emailDeliveries.status,
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.dedupeKey, input.dedupeKey))
    .limit(1);
  if (existing?.status !== "failed") return null;
  await getDatabase()
    .update(emailDeliveries)
    .set({ status: "sending", error: null })
    .where(eq(emailDeliveries.id, existing.id));
  return existing.id;
}

export async function settleEmailDelivery(
  deliveryId: string,
  input: {
    status: "sent" | "failed";
    providerMessageId?: string;
    error?: string;
  },
): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDatabase()
    .update(emailDeliveries)
    .set({
      status: input.status,
      providerMessageId: input.providerMessageId,
      error: input.error,
      sentAt: input.status === "sent" ? new Date() : null,
    })
    .where(eq(emailDeliveries.id, deliveryId));
}
