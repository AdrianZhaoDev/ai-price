import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  adminTransitRedirect,
  isAuthorizedAdminMutation,
  parseTransitDirectoryForm,
  revalidateTransitDirectory,
} from "@/lib/admin/transit-directory";
import { createTransitDirectoryEntry } from "@/lib/transit/directory";

export async function POST(request: NextRequest) {
  if (!isAuthorizedAdminMutation(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const input = parseTransitDirectoryForm(await request.formData());
  if (!input) return adminTransitRedirect(request, "invalid");
  try {
    await createTransitDirectoryEntry(input);
    revalidateTransitDirectory();
    return adminTransitRedirect(request, "created");
  } catch {
    return adminTransitRedirect(request, "failed");
  }
}
