import { type NextRequest } from "next/server";
import { handleDirectorySubmission } from "@/lib/transit/submission-route";

export async function POST(request: NextRequest) {
  return handleDirectorySubmission(request, "channels");
}
