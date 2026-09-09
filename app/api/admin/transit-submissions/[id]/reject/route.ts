import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminTransitRedirect,
  isAuthorizedAdminMutation,
} from "@/lib/admin/transit-directory";
import { reviewTransitSubmission } from "@/lib/transit/directory";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAuthorizedAdminMutation(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return adminTransitRedirect(request, "invalid");
  try {
    const rejected = await reviewTransitSubmission(id.data, "rejected");
    return adminTransitRedirect(request, rejected ? "rejected" : "failed");
  } catch {
    return adminTransitRedirect(request, "failed");
  }
}
