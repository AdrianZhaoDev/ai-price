import { handleChannelsGet } from "@/app/api/_public-data/handlers";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleChannelsGet(request, "products");
}
