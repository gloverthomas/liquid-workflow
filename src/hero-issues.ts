/** Curated hero tickets with dedicated planner/implement prompts and eval rubrics. */
export const HERO_ISSUE_IDS = new Set(["LIQ-9", "LIQ-15", "LIQ-16", "LIQ-17", "LIQ-24"]);

export function isHeroIssue(identifier: string): boolean {
  return HERO_ISSUE_IDS.has(identifier.trim().toUpperCase());
}
