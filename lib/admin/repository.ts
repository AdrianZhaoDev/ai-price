import { getDatabase } from "@/lib/db/client";
import { subscribers, subscriptions } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function listAdminSubscriptions() {
  return getDatabase()
    .select({
      id: subscriptions.id,
      email: subscribers.emailNormalized,
      providerSlug: subscriptions.providerSlug,
      planSlug: subscriptions.planSlug,
      status: subscriptions.status,
      confirmedAt: subscriptions.confirmedAt,
      unsubscribedAt: subscriptions.unsubscribedAt,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .innerJoin(subscribers, eq(subscriptions.subscriberId, subscribers.id))
    .orderBy(desc(subscriptions.updatedAt));
}
