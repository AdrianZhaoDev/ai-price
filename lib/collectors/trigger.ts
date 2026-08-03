export type CollectionTrigger = "scheduled" | "github_actions" | "manual";

export function resolveCollectionTrigger(
  argumentsList: string[],
  githubActions: boolean,
): CollectionTrigger {
  const requestedTrigger = argumentsList
    .find((argument) => argument.startsWith("--trigger="))
    ?.slice("--trigger=".length);
  if (requestedTrigger && requestedTrigger !== "scheduled") {
    throw new Error(`Unsupported collection trigger: ${requestedTrigger}.`);
  }
  if (requestedTrigger === "scheduled") return "scheduled";
  return githubActions ? "github_actions" : "manual";
}
