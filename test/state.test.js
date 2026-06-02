import test from "node:test";
import assert from "node:assert/strict";
import { buildCompactionState, buildGatewayState, buildResetState, formatInjectedState } from "../src/state.js";

test("captures sensitive root prompt work as needs_alignment", () => {
  const state = buildCompactionState({
    ctx: { sessionKey: "agent:main:telegram:direct:USER_ID" },
    event: {
      preparation: {
        tokensBefore: 12345,
        messagesToSummarize: [
          { role: "user", content: "我們來盤 AGENTS.md，不要直接改，全部盤完再 patch" },
          { role: "assistant", content: "收到，只記錄變更清單。" },
        ],
      },
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
      alwaysRequireAlignment: true,
      sensitivePatterns: ["AGENTS.md", "apply_patch", "commit"],
    },
  });

  assert.equal(state.schema, "openclaw.compaction-state.v1");
  assert.equal(state.currentMode, "needs_alignment");
  assert.equal(state.sessionKey, "agent:main:telegram:direct:USER_ID");
  assert.match(state.activeTask, /AGENTS\.md/);
  assert.ok(state.forbiddenNextSteps.some((line) => /apply patches/.test(line)));
});

test("truncates recent message snippets", () => {
  const state = buildCompactionState({
    event: {
      preparation: {
        messagesToSummarize: [
          { role: "user", content: "x".repeat(200) },
        ],
      },
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 80,
      alwaysRequireAlignment: false,
      sensitivePatterns: [],
    },
  });

  assert.equal(state.recentMessages.length, 1);
  assert.ok(state.recentMessages[0].text.length < 120);
  assert.match(state.recentMessages[0].text, /truncated/);
});

test("captures gateway restart as needs_alignment", () => {
  const previousState = buildCompactionState({
    event: {
      preparation: {
        messagesToSummarize: [
          { role: "user", content: "好..那現在改一改plugins吧" },
        ],
      },
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
      alwaysRequireAlignment: true,
      sensitivePatterns: ["plugins"],
    },
  });

  const state = buildGatewayState({
    event: { reason: "gateway restart requested" },
    ctx: { port: 18789 },
    phase: "stop",
    previousState,
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
    },
  });

  assert.equal(state.currentMode, "needs_alignment");
  assert.equal(state.trigger, "gateway_stop");
  assert.equal(state.gateway.port, 18789);
  assert.match(state.activeTask, /plugins/);
  assert.ok(state.forbiddenNextSteps.some((line) => /commit/.test(line)));
  assert.match(formatInjectedState(state), /gateway_stop/);
});

test("does not carry commit and restart lifecycle task across gateway restart", () => {
  const state = buildGatewayState({
    event: { reason: "gateway restart requested" },
    phase: "start",
    previousState: {
      schema: "openclaw.compaction-state.v1",
      capturedAt: new Date().toISOString(),
      activeTask: "那先commit再重啟geteway套用變更",
      recentMessages: [
        { role: "user", text: "那先commit再重啟geteway套用變更" },
      ],
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
    },
  });

  assert.equal(state.trigger, "gateway_start");
  assert.doesNotMatch(state.activeTask, /commit/);
  assert.doesNotMatch(state.activeTask, /重啟/);
  assert.doesNotMatch(state.recentMessages.map((message) => message.text).join("\n"), /commit/);
  assert.deepEqual(state.afterRestartCommands, []);
  assert.match(state.nextExpectedAction, /Do not continue lifecycle tasks/);
});

test("preserves only explicit after-restart commands", () => {
  const state = buildGatewayState({
    phase: "start",
    previousState: {
      schema: "openclaw.compaction-state.v1",
      capturedAt: new Date().toISOString(),
      activeTask: "修 compaction-state-guard 的 restart handoff",
      afterRestartCommands: ["openclaw plugins list | rg compaction-state-guard"],
      recentMessages: [
        { role: "user", text: "那先commit再重啟geteway套用變更" },
        { role: "assistant", text: "修 compaction-state-guard 的 restart handoff" },
      ],
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
    },
  });

  assert.match(state.planSummary, /restart handoff/);
  assert.deepEqual(state.afterRestartCommands, ["openclaw plugins list | rg compaction-state-guard"]);
  assert.match(formatInjectedState(state), /afterRestartCommands/);
});

test("captures /new reset as recovery mode with autonomous search guidance", () => {
  const state = buildResetState({
    event: {
      reason: "new",
      sessionFile: "/tmp/session.jsonl",
      messages: [
        { role: "user", content: "先幫豪哥 kit 的 plugins 寫 README" },
        { role: "assistant", content: "我先列出 agent-bus 和 compaction-state-guard。" },
        { role: "user", content: "先補 /new /reset 保護再寫 README" },
      ],
    },
    ctx: {
      sessionKey: "agent:main:telegram:direct:USER_ID",
      sessionId: "old-session",
    },
    config: {
      maxMessages: 8,
      maxSnippetChars: 320,
      sensitivePatterns: ["apply_patch", "commit"],
    },
  });

  const injected = formatInjectedState(state);

  assert.equal(state.currentMode, "needs_recovery");
  assert.equal(state.trigger, "before_reset:new");
  assert.equal(state.reset.action, "new");
  assert.match(state.activeTask, /保護/);
  assert.match(injected, /unfinished or ambiguous items/);
  assert.match(injected, /wait for confirmation/);
  assert.ok(state.forbiddenNextSteps.some((line) => /apply patches/.test(line)));
});
