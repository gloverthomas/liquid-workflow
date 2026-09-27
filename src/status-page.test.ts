import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cursorAgentsGate, renderStatusPage, type StatusHealth } from "./status-page.js";

const health = (dryRun: boolean): StatusHealth => ({
  service: "liquid-workflow",
  dryRun,
  evalGate: true,
  ciGate: true,
  requireFormalApproval: true,
  workflowEnabled: true,
  signalEnabled: true,
  linearAutoEnabled: true,
  githubAutoDoneEnabled: true,
  githubAutoInReviewEnabled: true,
  implementBypassEvalOnLinear: true,
  host: "127.0.0.1",
  port: 4100,
});

const dryRunWords = /dry[\s_-]*run/i;

describe("status page agent gate", () => {
  it("says agents are ready when the service will execute", () => {
    const gate = cursorAgentsGate(false);
    assert.deepEqual(gate, {
      on: true,
      label: "Cursor agents",
      hint: "Ready to launch live Cursor SDK agents",
      hostNote: "",
    });

    const html = renderStatusPage(health(false), "");
    assert.match(
      html,
      /<span class="label">Cursor agents<\/span><span class="hint">Ready to launch live Cursor SDK agents<\/span><\/div><span class="on">ON<\/span>/,
    );
    assert.match(html, /<span class="meta">127\.0\.0\.1:4100<\/span>/);
    assert.match(html, /Eval gate/);
    assert.match(html, /Formal approval/);
    assert.match(html, />Workflow</);
    assert.doesNotMatch(html, dryRunWords);
    assert.doesNotMatch(html, /No live Cursor SDK agents/);
  });

  it("says agents are not executing when the non-executing mode is on", () => {
    const gate = cursorAgentsGate(true);
    assert.equal(gate.on, false);
    assert.equal(gate.label, "Cursor agents");
    assert.equal(gate.hint, "SDK agents are not executing");
    assert.equal(gate.hostNote, " · not executing");

    const html = renderStatusPage(health(true), "");
    assert.match(
      html,
      /<span class="label">Cursor agents<\/span><span class="hint">SDK agents are not executing<\/span><\/div><span class="off">OFF<\/span>/,
    );
    assert.match(html, /127\.0\.0\.1:4100 · not executing/);
    assert.doesNotMatch(html, dryRunWords);
  });
});
