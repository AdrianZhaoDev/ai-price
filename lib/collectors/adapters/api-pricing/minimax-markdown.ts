/** Normalize MiniMax's compact MDX tables without changing other providers. */
export function normalizeMiniMaxMarkdown(body: string): string {
  return body
    .replace(/^(\s*\|(?:\s*:?-+:?\s*\|)+)\s*$/gm, (line) =>
      line.replace(/-+/g, "---"),
    )
    .replace(/~~[^~\n]*~~/g, "");
}
