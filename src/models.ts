import { Cursor, type ModelSelection } from "@cursor/sdk";
import { config } from "./config.js";

/** Product labels reviewers understand. SDK wire values differ for Balance. */
export type OptimizeFor = "cost" | "balanced" | "intelligence";

export type RoleId =
  | "planner"
  | "security"
  | "quality"
  | "implementer";

export type RoleModel = {
  role: RoleId;
  label: string;
  optimizeFor: OptimizeFor;
  rationale: string;
  selection: ModelSelection;
  resolvedVia: "router" | "fixed" | "fallback";
};

const ROLE_POLICY: Record<
  RoleId,
  { label: string; optimizeFor: OptimizeFor; rationale: string; fixedEnv?: string }
> = {
  planner: {
    label: "Planner (orchestrator)",
    optimizeFor: "intelligence",
    rationale: "Cross-repo classification and bounded plan — prefer Intelligence.",
    fixedEnv: "CURSOR_MODEL_PLANNER",
  },
  security: {
    label: "Security reviewer",
    optimizeFor: "intelligence",
    rationale: "Auth/token/CORS/deep-link abuse surface — prefer Intelligence.",
    fixedEnv: "CURSOR_MODEL_SECURITY",
  },
  quality: {
    label: "Code quality reviewer",
    optimizeFor: "cost",
    rationale: "Scoped lint/parity/diff hygiene — Cost-effective Router mode.",
    fixedEnv: "CURSOR_MODEL_QUALITY",
  },
  implementer: {
    label: "Implementer",
    optimizeFor: "balanced",
    rationale: "Mechanical LIQ-9 edits + PR — Balance for throughput vs quality.",
    fixedEnv: "CURSOR_MODEL_IMPLEMENTER",
  },
};

function fixedSelection(envName: string | undefined): ModelSelection | undefined {
  if (!envName) return undefined;
  const id = process.env[envName]?.trim();
  if (!id) return undefined;
  return { id };
}

function routerSelection(optimizeFor: OptimizeFor): ModelSelection {
  return {
    id: "auto-smart",
    params: [{ id: "optimize_for", value: optimizeFor }],
  };
}

function fallbackSelection(): ModelSelection {
  return { id: config.cursorModel };
}

let catalogPromise: Promise<Awaited<ReturnType<typeof Cursor.models.list>> | null> | null =
  null;

async function loadCatalog() {
  if (config.dryRun || !config.cursorApiKey) return null;
  if (!catalogPromise) {
    catalogPromise = Cursor.models.list({ apiKey: config.cursorApiKey }).catch(() => null);
  }
  return catalogPromise;
}

/**
 * Resolve a role to a ModelSelection.
 * Prefer explicit env override → Cursor Router (auto-smart) when available →
 * fixed CURSOR_MODEL fallback so demos still run without Router entitlement.
 */
export async function resolveRoleModel(role: RoleId): Promise<RoleModel> {
  const policy = ROLE_POLICY[role];
  const fixed = fixedSelection(policy.fixedEnv);
  if (fixed) {
    return {
      role,
      label: policy.label,
      optimizeFor: policy.optimizeFor,
      rationale: policy.rationale,
      selection: fixed,
      resolvedVia: "fixed",
    };
  }

  const catalog = await loadCatalog();
  const router = catalog?.find((m) => m.id === "auto-smart");
  const optimizeParam = router?.parameters?.find((p) => p.id === "optimize_for");
  const allowed = new Set(optimizeParam?.values.map((v) => v.value) ?? []);

  if (router && allowed.has(policy.optimizeFor)) {
    return {
      role,
      label: policy.label,
      optimizeFor: policy.optimizeFor,
      rationale: policy.rationale,
      selection: routerSelection(policy.optimizeFor),
      resolvedVia: "router",
    };
  }

  return {
    role,
    label: policy.label,
    optimizeFor: policy.optimizeFor,
    rationale: `${policy.rationale} (Router unavailable — using ${config.cursorModel}.)`,
    selection: fallbackSelection(),
    resolvedVia: "fallback",
  };
}

export async function resolveModelRoster(): Promise<RoleModel[]> {
  return Promise.all(
    (Object.keys(ROLE_POLICY) as RoleId[]).map((role) => resolveRoleModel(role)),
  );
}

export function describeRoster(roster: RoleModel[]): string {
  return roster
    .map((r) => {
      const id =
        r.selection.id === "auto-smart"
          ? `auto-smart / ${r.optimizeFor}`
          : r.selection.id;
      return `- ${r.label}: ${id} (${r.resolvedVia}) — ${r.rationale}`;
    })
    .join("\n");
}
