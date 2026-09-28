import { config } from "./config.js";

export const PRODUCT_SIGNAL_PHRASE = "product signal";

export function containsProductSignal(...texts: Array<string | undefined>): boolean {
  const haystack = texts.filter(Boolean).join("\n").toLowerCase();
  return haystack.includes(PRODUCT_SIGNAL_PHRASE);
}

/*
  Says whether this ticket may plan or implement.
  It runs when TRIGGER_ISSUE_IDS is empty, or the id is listed, or the title or description contains "product signal".
  It does not run when the id is missing, or when the list is set and the ticket misses both the list and that phrase.
  Next: In Progress plans. In Review opens the implement path.
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
