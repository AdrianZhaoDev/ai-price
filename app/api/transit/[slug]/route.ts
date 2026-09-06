import { handleTransitDetailGet } from "@/app/api/_public-data/handlers";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<Response> {
  return handleTransitDetailGet(request, context);
}
