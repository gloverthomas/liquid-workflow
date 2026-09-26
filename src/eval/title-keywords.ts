const STOP = new Set([
  "hero",
  "works",
  "work",
  "core",
  "but",
  "dead",
  "reporting",
  "the",
  "and",
  "for",
  "with",
  "does",
  "not",
  "this",
  "that",
  "from",
  "into",
  "still",
  "only",
  "when",
  "after",
  "before",
  "liquid",
  "assistant",
]);

/** Significant words from a ticket title for dynamic eval rubrics. */
export function titleKeywords(title: string, max = 4): string[] {
  return title
    .toLowerCase()
    .replace(/\[hero\]/gi, " ")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w))
    .slice(0, max);
}
