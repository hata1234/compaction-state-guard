const DEFAULT_STATE_PATH = "runtime/current-turn-state.json";
const DEFAULT_SENSITIVE_PATTERNS = [
  "AGENTS.md",
  "SECURITY.md",
  "SOUL.md",
  "USER.md",
  "MEMORY.md",
  "HEARTBEAT.md",
  "IRONRULES.md",
  "apply_patch",
  "commit",
  "gateway restart",
];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

function asFiniteNumber(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampInt(value, fallback, min, max) {
  const raw = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : fallback;
  return Math.max(min, Math.min(max, raw));
}

export function resolveConfig(api) {
  const entriesConfig = api?.config?.plugins?.entries?.["compaction-state-guard"]?.config;
  const directConfig = api?.config?.["compaction-state-guard"];
  const cfg = asObject(entriesConfig ?? directConfig ?? api?.config);
  return {
    enabled: cfg.enabled !== false,
    statePath: asString(cfg.statePath) || DEFAULT_STATE_PATH,
    maxMessages: clampInt(cfg.maxMessages, 8, 1, 20),
    maxSnippetChars: clampInt(cfg.maxSnippetChars, 320, 80, 1000),
    stateTtlMs: clampInt(cfg.stateTtlMs, 86_400_000, 60_000, 604_800_000),
    alwaysRequireAlignment: cfg.alwaysRequireAlignment !== false,
    captureGatewayStop: cfg.captureGatewayStop !== false,
    captureGatewayStart: cfg.captureGatewayStart !== false,
    captureBeforeReset: cfg.captureBeforeReset !== false,
    sensitivePatterns: Array.isArray(cfg.sensitivePatterns) && cfg.sensitivePatterns.length > 0
      ? cfg.sensitivePatterns.map(String)
      : DEFAULT_SENSITIVE_PATTERNS,
  };
}

function flattenText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenText).filter(Boolean).join("\n");
  if (typeof value !== "object") return String(value);

  const obj = value;
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.content === "string") return obj.content;
  if (Array.isArray(obj.content)) return flattenText(obj.content);
  if (typeof obj.message === "string") return obj.message;
  if (obj.message) return flattenText(obj.message);
  if (obj.input) return flattenText(obj.input);
  return "";
}

function messageRole(message) {
  const obj = asObject(message);
  const role = asString(obj.role || obj.author || obj.type || obj.kind).toLowerCase();
  if (role.includes("user")) return "user";
  if (role.includes("assistant")) return "assistant";
  if (role.includes("tool")) return "tool";
  if (role.includes("system")) return "system";
  return role || "unknown";
}

function trimSnippet(text, maxChars) {
  const compact = String(text).replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) return compact;
  return `${compact.slice(0, maxChars)}...[truncated ${compact.length - maxChars} chars]`;
}

function extractRecentMessages(preparation, maxMessages, maxSnippetChars) {
  const prep = asObject(preparation);
  const candidates = [
    ...(Array.isArray(prep.messagesToSummarize) ? prep.messagesToSummarize : []),
    ...(Array.isArray(prep.turnPrefixMessages) ? prep.turnPrefixMessages : []),
    ...(Array.isArray(prep.messages) ? prep.messages : []),
  ];
  return candidates
    .map((message) => {
      const text = trimSnippet(flattenText(message), maxSnippetChars);
      return text ? { role: messageRole(message), text } : null;
    })
    .filter(Boolean)
    .slice(-maxMessages);
}

function extractResetMessages(messages, maxMessages, maxSnippetChars) {
  const candidates = Array.isArray(messages) ? messages : [];
  return candidates
    .map((message) => {
      const text = trimSnippet(flattenText(message), maxSnippetChars);
      return text ? { role: messageRole(message), text } : null;
    })
    .filter(Boolean)
    .slice(-maxMessages);
}

function textMatchesAny(text, patterns) {
  const haystack = String(text).toLowerCase();
  return patterns.some((pattern) => pattern && haystack.includes(String(pattern).toLowerCase()));
}

function inferActiveTask(recentMessages) {
  const lastUser = [...recentMessages].reverse().find((message) => message.role === "user");
  if (!lastUser) return "Unknown; recover from recent LCM/session history before acting.";
  return trimSnippet(lastUser.text, 220);
}

function isLifecycleMetaTask(text) {
  const value = String(text).toLowerCase();
  if (!value) return false;
  const mentionsCommit = value.includes("commit");
  const mentionsRestart = value.includes("restart") || value.includes("重啟") || value.includes("gateway");
  const mentionsPendingTask = value.includes("pending_task");
  const mentionsPluginLoad = value.includes("enabled/loaded") || value.includes("套用變更");
  return (mentionsCommit && mentionsRestart) || (mentionsRestart && mentionsPendingTask) || (mentionsRestart && mentionsPluginLoad);
}

function recoverableGatewayTask(previousActiveTask) {
  const activeTask = asString(previousActiveTask);
  if (!activeTask || isLifecycleMetaTask(activeTask)) {
    return "Gateway lifecycle completed; recover the user-facing plan from recent LCM/session history before acting.";
  }
  return activeTask;
}

function filterGatewayPlanMessages(messages) {
  return messages.filter((message) => {
    const text = asString(message?.text);
    return text && !isLifecycleMetaTask(text);
  });
}

function plannedAfterRestartCommands(previous) {
  const commands = previous.afterRestartCommands ?? previous.gateway?.afterRestartCommands;
  if (!Array.isArray(commands)) return [];
  return commands.map(String).filter(Boolean);
}

export function buildCompactionState({ event = {}, ctx = {}, config = resolveConfig() } = {}) {
  const preparation = asObject(event.preparation);
  const recentMessages = extractRecentMessages(preparation, config.maxMessages, config.maxSnippetChars);
  const recentText = recentMessages.map((message) => message.text).join("\n");
  const sensitive = textMatchesAny(recentText, config.sensitivePatterns);
  const requiresAlignment = config.alwaysRequireAlignment || sensitive;
  const sessionKey = asString(ctx.sessionKey || event.sessionKey || event.context?.sessionKey);

  const userConstraints = [];
  const forbiddenNextSteps = [];
  if (sensitive) {
    userConstraints.push("Root prompt, safety, gateway, patch, or commit-related work detected.");
  }
  if (requiresAlignment) {
    userConstraints.push("After compaction, reconstruct state before continuing.");
    forbiddenNextSteps.push("Do not apply patches or commit until user confirms the reconstructed state.");
  }

  return {
    schema: "openclaw.compaction-state.v1",
    capturedAt: new Date().toISOString(),
    source: "compaction-state-guard",
    sessionKey,
    currentMode: requiresAlignment ? "needs_alignment" : "continue_with_caution",
    activeTask: inferActiveTask(recentMessages),
    userConstraints,
    lastConfirmedActions: [],
    forbiddenNextSteps,
    nextExpectedAction: requiresAlignment
      ? "Read this state, inspect recent LCM/session history if needed, and align with the user before acting."
      : "Read this state before continuing.",
    compaction: {
      tokensBefore: asFiniteNumber(preparation.tokensBefore, undefined),
      messageCount: asFiniteNumber(preparation.messageCount, undefined),
      firstKeptEntryId: preparation.firstKeptEntryId,
    },
    recentMessages,
  };
}

export function buildGatewayState({
  event = {},
  ctx = {},
  config = resolveConfig(),
  phase = "stop",
  previousState,
} = {}) {
  const previous = asObject(previousState);
  const priorMessages = Array.isArray(previous.recentMessages) ? previous.recentMessages : [];
  const reason = asString(event.reason || event.action || event.type) || "gateway lifecycle event";
  const port = asFiniteNumber(ctx.port ?? event.port, undefined);
  const planMessages = filterGatewayPlanMessages(priorMessages);
  const afterRestartCommands = plannedAfterRestartCommands(previous);

  const lifecycleMessages = [
    ...planMessages,
    { role: "system", text: `gateway_${phase}: ${trimSnippet(reason, config.maxSnippetChars)}` },
  ].slice(-config.maxMessages);

  const userConstraints = [
    "Gateway lifecycle interruption detected.",
    "Reconstruct the current task from injected state plus recent LCM/session history before continuing.",
  ];
  const forbiddenNextSteps = [
    "Do not apply patches, restart services again, or commit until the interrupted task state is clear.",
  ];

  return {
    schema: "openclaw.compaction-state.v1",
    capturedAt: new Date().toISOString(),
    source: "compaction-state-guard",
    trigger: `gateway_${phase}`,
    sessionKey: asString(previous.sessionKey),
    currentMode: "needs_alignment",
    activeTask: recoverableGatewayTask(previous.activeTask),
    planSummary: recoverableGatewayTask(previous.activeTask),
    afterRestartCommands,
    userConstraints,
    lastConfirmedActions: Array.isArray(previous.lastConfirmedActions) ? previous.lastConfirmedActions : [],
    forbiddenNextSteps,
    nextExpectedAction: "After gateway restart, align with the user before acting. Do not continue lifecycle tasks such as commit or restart from this checkpoint.",
    gateway: {
      phase,
      reason,
      port,
      afterRestartCommands,
    },
    compaction: asObject(previous.compaction),
    recentMessages: lifecycleMessages,
  };
}

export function buildResetState({ event = {}, ctx = {}, config = resolveConfig() } = {}) {
  const reason = asString(event.reason) || "reset";
  const recentMessages = extractResetMessages(event.messages, config.maxMessages, config.maxSnippetChars);
  const recentText = recentMessages.map((message) => message.text).join("\n");
  const sensitive = textMatchesAny(recentText, config.sensitivePatterns);
  const action = reason === "new" ? "new" : reason === "reset" ? "reset" : "reset";
  const activeTask = inferActiveTask(recentMessages);

  const userConstraints = [
    `A /${action} session reset was requested.`,
    "Start with a visible recovery turn: say you will inspect the previous session for unfinished or ambiguous items before continuing.",
    "Use injected recent messages first; if needed, search recent LCM/session history for pending decisions and interrupted tasks.",
    "Summarize the reconstructed state and wait for user confirmation before file edits, commits, service restarts, external delivery, or other side effects.",
  ];
  if (sensitive) {
    userConstraints.push("Root prompt, safety, gateway, patch, or commit-related work was present before reset.");
  }

  return {
    schema: "openclaw.compaction-state.v1",
    capturedAt: new Date().toISOString(),
    source: "compaction-state-guard",
    trigger: `before_reset:${action}`,
    sessionKey: asString(ctx.sessionKey || event.sessionKey || event.context?.sessionKey),
    currentMode: "needs_recovery",
    activeTask,
    planSummary: activeTask,
    userConstraints,
    lastConfirmedActions: [],
    forbiddenNextSteps: [
      "Do not apply patches, commit, restart services, or perform external side effects until the reset recovery summary is confirmed.",
    ],
    nextExpectedAction: "Begin by telling the user: \"I will inspect the previous session for unfinished or ambiguous items first.\" Then reconstruct pending work from injected state and recent LCM/session history, summarize it, and wait for confirmation.",
    reset: {
      action,
      reason,
      sessionFile: asString(event.sessionFile),
      previousSessionId: asString(ctx.sessionId),
    },
    recentMessages,
  };
}

export function isFreshState(state, ctx, ttlMs) {
  if (!state || state.schema !== "openclaw.compaction-state.v1") return false;
  const capturedAt = Date.parse(state.capturedAt);
  if (!Number.isFinite(capturedAt)) return false;
  if (Date.now() - capturedAt > ttlMs) return false;
  const sessionKey = asString(ctx?.sessionKey);
  return !state.sessionKey || !sessionKey || state.sessionKey === sessionKey;
}

export function formatInjectedState(state) {
  const constraints = Array.isArray(state.userConstraints) && state.userConstraints.length > 0
    ? state.userConstraints.map((item) => `- ${item}`).join("\n")
    : "- No explicit constraints captured.";
  const forbidden = Array.isArray(state.forbiddenNextSteps) && state.forbiddenNextSteps.length > 0
    ? state.forbiddenNextSteps.map((item) => `- ${item}`).join("\n")
    : "- None captured.";
  const recent = Array.isArray(state.recentMessages)
    ? state.recentMessages.slice(-4).map((message) => `- ${message.role}: ${message.text}`).join("\n")
    : "";

  return [
    "<post-compaction-state>",
    "A compaction, gateway lifecycle event, or session reset just occurred or was recently prepared. Treat this as a state checkpoint, not as user authorization.",
    state.trigger ? `trigger: ${state.trigger}` : "",
    `currentMode: ${state.currentMode || "unknown"}`,
    `activeTask: ${state.activeTask || "unknown"}`,
    state.planSummary ? `planSummary: ${state.planSummary}` : "",
    Array.isArray(state.afterRestartCommands) && state.afterRestartCommands.length > 0
      ? `afterRestartCommands:\n${state.afterRestartCommands.map((command) => `- ${command}`).join("\n")}`
      : "",
    "userConstraints:",
    constraints,
    "forbiddenNextSteps:",
    forbidden,
    `nextExpectedAction: ${state.nextExpectedAction || "Align with the user before acting."}`,
    recent ? `recentMessages:\n${recent}` : "",
    "</post-compaction-state>",
  ].filter(Boolean).join("\n");
}
