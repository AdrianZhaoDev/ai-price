import { DEFAULT_LOCALE, localizedPath, type Locale } from "@/lib/i18n";

export function modelDetailPath(
  modelId: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return localizedPath(
    locale,
    `/models/${modelId
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/")}`,
  );
}

export function modelIdFromPath(path: string[]): string {
  // App Router already decodes catch-all route parameters. Decoding again can
  // throw for a literal percent sign and can also change a valid model ID.
  return path.join("/");
}

export function isSafeModelId(modelId: string): boolean {
  return (
    modelId.length >= 3 &&
    modelId.length <= 240 &&
    modelId.includes("/") &&
    !modelId.includes("..") &&
    /^[A-Za-z0-9._:/+-]+$/.test(modelId)
  );
}
