const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function getApplicationBaseUrl(fallbackUrl?: string): URL {
  const configuredUrl = process.env.APP_URL?.trim();
  if (!configuredUrl && process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is required in production.");
  }

  const baseUrl = new URL(
    configuredUrl || fallbackUrl || "http://localhost:3000",
  );
  if (!["http:", "https:"].includes(baseUrl.protocol)) {
    throw new Error("APP_URL must use http or https.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    LOCAL_HOSTNAMES.has(baseUrl.hostname)
  ) {
    throw new Error("APP_URL must use a public hostname in production.");
  }

  baseUrl.pathname = "/";
  baseUrl.search = "";
  baseUrl.hash = "";
  return baseUrl;
}

export function createSubscriptionUrl(path: string, fallbackUrl?: string): URL {
  return new URL(path, getApplicationBaseUrl(fallbackUrl));
}
