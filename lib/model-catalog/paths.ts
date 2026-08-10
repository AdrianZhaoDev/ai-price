export function modelDetailPath(modelId: string): string {
  return `/models/${modelId
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
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
