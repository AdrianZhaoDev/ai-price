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
  const now = new Date();
  const staleBefore = now.getTime() - 10 * 60 * 1000;
  return getDatabase().transaction(async (tx) => {
    const [delivery] = await tx
      .insert(emailDeliveries)
      .values({
        messageType: input.type,
        recipientHash: hashEmail(input.recipient),
        dedupeKey: input.dedupeKey,
        status: "sending",
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning({ id: emailDeliveries.id });
    if (delivery) return delivery.id;

    const [existing] = await tx
      .select({
        id: emailDeliveries.id,
        status: emailDeliveries.status,
        createdAt: emailDeliveries.createdAt,
      })
      .from(emailDeliveries)
      .where(eq(emailDeliveries.dedupeKey, input.dedupeKey))
      .limit(1)
      .for("update");
    const reclaimable =
      existing?.status === "failed" ||
      (existing?.status === "sending" &&
        existing.createdAt.getTime() <= staleBefore);
    if (!existing || !reclaimable) return null;
    await tx
      .update(emailDeliveries)
      .set({
        status: "sending",
        error: null,
        providerMessageId: null,
        sentAt: null,
        createdAt: now,
      })
      .where(eq(emailDeliveries.id, existing.id));
    return existing.id;
  });
}

export async function isEmailDeliverySent(dedupeKey: string): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const [delivery] = await getDatabase()
    .select({ status: emailDeliveries.status })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.dedupeKey, dedupeKey))
    .limit(1);
  return delivery?.status === "sent";
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
