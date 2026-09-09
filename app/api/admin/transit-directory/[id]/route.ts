import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  adminTransitRedirect,
  isAuthorizedAdminMutation,
  parseTransitDirectoryForm,
  revalidateTransitDirectory,
} from "@/lib/admin/transit-directory";
import { updateTransitDirectoryEntry } from "@/lib/transit/directory";

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
    const updated = await updateTransitDirectoryEntry(id.data, input);
    if (updated) revalidateTransitDirectory();
    return adminTransitRedirect(request, updated ? "updated" : "failed");
  } catch {
    return adminTransitRedirect(request, "failed");
  }
}
