import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminTransitRedirect,
  isAuthorizedAdminMutation,
  parseTransitDirectoryForm,
  revalidateTransitDirectory,
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
  const input = parseTransitDirectoryForm(await request.formData());
  if (!id.success || !input) return adminTransitRedirect(request, "invalid");
  try {
    const approved = await reviewTransitSubmission(id.data, "approved", input);
    if (approved) revalidateTransitDirectory();
    return adminTransitRedirect(request, approved ? "approved" : "failed");
  } catch {
    return adminTransitRedirect(request, "failed");
  }
}
