import { isIP } from "node:net";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  ADMIN_SESSION_COOKIE,
  isAdminSession,
  isSameOriginRequest,
} from "@/lib/admin/auth";

const directoryFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
  websiteUrl: z
    .string()
    .trim()
    .min(1)
    .max(2048)
    .transform((value, ctx) => {
      try {
        const url = new URL(value);
        const hostname = url.hostname.replace(/\.$/, "");
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          isIP(hostname.replace(/^\[|\]$/g, "")) ||
          !hostname.includes(".") ||
          /\.(localhost|local|internal|test|invalid|example)$/.test(hostname)
        ) {
          throw new Error();
        }
        url.hash = "";
        return url.href;
      } catch {
        ctx.addIssue({ code: "custom", message: "Invalid website URL" });
        return z.NEVER;
      }
    }),
  descriptionZh: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\r\n\u0000-\u001f\u007f]+$/),
  descriptionEn: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[^\r\n\u0000-\u001f\u007f]+$/),
  rank: z.coerce.number().int().min(0).max(999_999),
});

export function isAuthorizedAdminMutation(request: NextRequest) {
  return (
    isSameOriginRequest(request) &&
    isAdminSession(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
  );
}

export function parseTransitDirectoryForm(formData: FormData) {
  const parsed = directoryFormSchema.safeParse({
    name: formData.get("name"),
    websiteUrl: formData.get("websiteUrl"),
    descriptionZh: formData.get("descriptionZh"),
    descriptionEn: formData.get("descriptionEn"),
    rank: formData.get("rank"),
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    published: formData.get("published") === "on",
  };
}

export function adminTransitRedirect(
  request: NextRequest,
  message:
    "created" | "updated" | "approved" | "rejected" | "invalid" | "failed",
) {
  const url = new URL("/admin/transit-submissions", request.url);
  url.searchParams.set("message", message);
  return NextResponse.redirect(url, 303);
}

export function revalidateTransitDirectory() {
  revalidatePath("/api-transit");
  revalidatePath("/en/api-transit");
}
