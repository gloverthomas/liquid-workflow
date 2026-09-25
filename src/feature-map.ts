/**
 * Liquid shell feature map — how an agent (or human) reaches each hero surface.
 * Inspired by poteto/pstack "feature map" practice: teach the agent the product paths
 * before asking it to verify or fix.
 */
export const LIQUID_FEATURE_MAP = `
## Liquid feature map (runtime verification paths)

| Surface | Core (liquid-accounting.world) | Reporting (reporting.liquid-accounting.world) | Proof |
| --- | --- | --- | --- |
| AI Assistant | Topbar **AI Assistant** → right rail → suggestion/send → chat reply (Grok or fixture) | Same chrome; **LIQ-24** when send fails (skills-ported rail, missing BFF) | Vitest+RTL \`assistant-unit\` + Playwright assistant proof + \`docs/pr-proof\` PNGs |
| Notifications | Header bell → inbox popover (open/close, Escape, outside click) | Same chrome; **LIQ-17** when dead | Playwright parity + \`e2e/proof\` / \`docs/pr-proof\` PNGs |
| Help centre | Global Help menu with working items | Same chrome; **LIQ-16** when dead | help-proof / help-parity CI jobs |
| Revenue deep-link | \`#revenue-summary\` | Must not invent broken hashes | cross-repo-parity.spec.ts |
| Legacy sales hash | Acknowledge \`#sales-summary\` → retarget | Same | LIQ-9 / LIQ-15 |
| Signal | N/A | Broken chrome POSTs \`/signal\` → Linear Todo triage only | Does **not** start plan |

### How to verify (required mindset)
1. Start from the **real UI path** above — do not invent alternate entry points.
2. Prefer running the app / Playwright / Vitest assistant-unit over reasoning from code alone.
3. One hero ticket = one atomic PR pair (Core and/or Reporting as needed) — no drive-by shell refactors.
4. CI gates on \`main\`: Core \`build\`+\`assistant-unit\`+\`smoke\`+\`parity-proof\`; Reporting \`build\`+\`assistant-unit\`+\`help-proof\`.
`.trim();
