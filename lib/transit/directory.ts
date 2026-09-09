import { asc, desc, eq, or } from "drizzle-orm";
import {
  getDatabase,
  getReadDatabase,
  isReadDatabaseConfigured,
} from "@/lib/db/client";
import { transitDirectoryEntries, transitSubmissions } from "@/lib/db/schema";
import { transitWebsiteKey } from "@/lib/transit/submissions";

export type TransitDirectoryInput = {
  name: string;
  websiteUrl: string;
  descriptionZh: string;
  descriptionEn: string;
  rank: number;
  published: boolean;
};

export const defaultTransitDirectoryEntries = [
  {
    name: "Low Price Radar API",
    websiteUrl: "https://ai.lowpriceradar.com/",
    descriptionZh: "Low Price Radar 的 AI API 网关。",
    descriptionEn: "The AI API gateway from Low Price Radar.",
    rank: 10,
    published: true,
  },
  {
    name: "CallAI",
    websiteUrl: "https://sub.callai.one/",
    descriptionZh: "提供多模型 AI API 中转服务。",
    descriptionEn: "An API relay service for multiple AI models.",
    rank: 20,
    published: true,
  },
  {
    name: "WAWA ZZ API",
    websiteUrl: "https://wawazz.xyz/",
    descriptionZh: "提供 AI API 中转调用服务。",
    descriptionEn: "A gateway for AI API calls.",
    rank: 30,
    published: true,
  },
] as const;

export async function listPublicTransitDirectoryEntries() {
  if (!isReadDatabaseConfigured()) return [...defaultTransitDirectoryEntries];
  const rows = await getReadDatabase()
    .select({
      id: transitDirectoryEntries.id,
      name: transitDirectoryEntries.name,
      websiteUrl: transitDirectoryEntries.websiteUrl,
      descriptionZh: transitDirectoryEntries.descriptionZh,
      descriptionEn: transitDirectoryEntries.descriptionEn,
      rank: transitDirectoryEntries.rank,
      published: transitDirectoryEntries.published,
    })
    .from(transitDirectoryEntries)
    .where(eq(transitDirectoryEntries.published, true))
    .orderBy(
      asc(transitDirectoryEntries.rank),
      asc(transitDirectoryEntries.name),
    );
  return rows;
}

export async function listAdminTransitDirectoryEntries() {
  return getDatabase()
    .select()
    .from(transitDirectoryEntries)
    .orderBy(
      asc(transitDirectoryEntries.rank),
      asc(transitDirectoryEntries.name),
    );
}

export async function listAdminTransitSubmissions() {
  return getDatabase()
    .select()
    .from(transitSubmissions)
    .orderBy(desc(transitSubmissions.createdAt));
}

export async function createTransitDirectoryEntry(
  input: TransitDirectoryInput,
) {
  const now = new Date();
  await getDatabase()
    .insert(transitDirectoryEntries)
    .values({
      ...input,
      websiteKey: transitWebsiteKey(input.websiteUrl),
      createdAt: now,
      updatedAt: now,
    });
}

export async function updateTransitDirectoryEntry(
  id: string,
  input: TransitDirectoryInput,
) {
  const [updated] = await getDatabase()
    .update(transitDirectoryEntries)
    .set({
      ...input,
      websiteKey: transitWebsiteKey(input.websiteUrl),
      updatedAt: new Date(),
    })
    .where(eq(transitDirectoryEntries.id, id))
    .returning({ id: transitDirectoryEntries.id });
  return Boolean(updated);
}

export async function reviewTransitSubmission(
  id: string,
  decision: "approved" | "rejected",
  input?: TransitDirectoryInput,
) {
  return getDatabase().transaction(async (tx) => {
    const [submission] = await tx
      .select()
      .from(transitSubmissions)
      .where(eq(transitSubmissions.id, id))
      .limit(1)
      .for("update");
    if (!submission) return false;

    const now = new Date();
    if (decision === "approved" && input) {
      const websiteKey = transitWebsiteKey(input.websiteUrl);
      const [existing] = await tx
        .select({ id: transitDirectoryEntries.id })
        .from(transitDirectoryEntries)
        .where(
          or(
            eq(transitDirectoryEntries.websiteKey, websiteKey),
            eq(transitDirectoryEntries.sourceSubmissionId, id),
          ),
        )
        .limit(1);
      if (existing) {
        await tx
          .update(transitDirectoryEntries)
          .set({
            ...input,
            websiteKey,
            sourceSubmissionId: id,
            updatedAt: now,
          })
          .where(eq(transitDirectoryEntries.id, existing.id));
      } else {
        await tx.insert(transitDirectoryEntries).values({
          ...input,
          websiteKey,
          sourceSubmissionId: id,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    await tx
      .update(transitSubmissions)
      .set({ reviewStatus: decision, reviewedAt: now })
      .where(eq(transitSubmissions.id, id));
    return true;
  });
}
