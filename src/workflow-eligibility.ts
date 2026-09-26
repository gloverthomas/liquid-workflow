import { config } from "./config.js";

export const PRODUCT_SIGNAL_PHRASE = "product signal";

export function containsProductSignal(...texts: Array<string | undefined>): boolean {
  const haystack = texts.filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(PRODUCT_SIGNAL_PHRASE);
}

/**
 * Linear In Progress / In Review automation runs when:
 * - TRIGGER_ISSUE_IDS is empty → every issue, or
 * - identifier is listed in TRIGGER_ISSUE_IDS, or
 * - title/description contains "product signal".
 */
export function isWorkflowEligible(
  identifier: string,
  title: string,
  description?: string,
): boolean {
  const id = identifier.trim().toUpperCase();
  if (!id) return false;
  if (config.triggerIssueIds.length === 0) return true;
  if (config.triggerIssueIds.includes(id)) return true;
  return containsProductSignal(title, description);
}
