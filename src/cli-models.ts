/** Print the resolved model roster (Router Cost/Balance/Intelligence or fallbacks). */
import { buildSpecialistAgents } from "./agents.js";
import { describeRoster } from "./models.js";

const specialists = await buildSpecialistAgents();
console.log("Liquid model roster\n");
console.log(describeRoster(specialists.roster));
console.log("\nSpecialist subagents:", Object.keys(specialists.agents).join(", "));
