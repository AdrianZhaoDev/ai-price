import { GET } from "@/app/api/subscriptions/unsubscribe/route";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  unsubscribe: vi.fn(),
}));

vi.mock("@/lib/subscriptions/repository", () => ({
  unsubscribe: mocks.unsubscribe,
}));

describe("unsubscribe route locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_URL", "http://localhost:3000");
    mocks.unsubscribe.mockResolvedValue(true);
  });

  it("keeps a Chinese result explicit for English-browser email clicks", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/subscriptions/unsubscribe?token=test&locale=zh-CN",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/subscription/result?status=unsubscribed&locale=zh-CN",
    );
  });

  it("keeps English results on the prefixed route", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/subscriptions/unsubscribe?token=test&locale=en",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/en/subscription/result?status=unsubscribed&locale=en",
    );
  });
});
