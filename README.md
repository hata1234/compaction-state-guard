# Compaction State Guard

Default-off OpenClaw plugin that records a compact recovery checkpoint before context compaction, gateway restarts, and `/new` or `/reset` session resets.

Languages: [繁體中文](#繁體中文) | [English](#english) | [简体中文](#简体中文) | [日本語](#日本語) | [한국어](#한국어)

## 繁體中文

### 用途

Compaction State Guard 用來避免 agent 在 context compaction、gateway restart、`/new`、`/reset` 之後，直接憑不完整記憶繼續修改檔案或執行高風險操作。

它會寫入一份短 checkpoint，下一輪 prompt build 時注入，要求 agent 先重建狀態、回報理解、等使用者確認後再繼續。

### 支援場景

- `before_compaction`: context 壓縮前保存當前任務摘要
- `gateway_stop`: gateway 停止前保存 restart checkpoint
- `gateway_start`: gateway 啟動後刷新 checkpoint
- `before_reset`: `/new` 和 `/reset` 前保存 reset recovery checkpoint
- `before_prompt_build`: 下一輪注入 checkpoint，然後刪除，確保 one-shot

### `/new` / `/reset` Recovery 行為

當使用者執行 `/new` 或 `/reset`，plugin 會注入 `needs_recovery` 狀態。Agent 應先明確說明：

```text
I will inspect the previous session for unfinished or ambiguous items first.
```

意思是：先檢查上一個 session 是否有未完成、未確認、或有風險的事項。Agent 應先使用注入的 recent messages；如果不足，再查 recent LCM/session history。重建狀態後要先摘要給使用者確認。

確認前禁止：

- apply patch
- commit
- restart service
- external delivery
- credential handling
- 任何會造成 side effect 的操作

### Default Output

```json
{
  "schema": "openclaw.compaction-state.v1",
  "sessionKey": "agent:main:telegram:direct:USER_ID",
  "trigger": "before_reset:new",
  "currentMode": "needs_recovery",
  "activeTask": "Inferred from recent user messages",
  "userConstraints": [
    "A /new session reset was requested.",
    "Start with a visible recovery turn."
  ],
  "forbiddenNextSteps": [
    "Do not apply patches, commit, restart services, or perform external side effects until the reset recovery summary is confirmed."
  ],
  "nextExpectedAction": "Reconstruct pending work, summarize it, and wait for confirmation.",
  "recentMessages": []
}
```

### Config

- `statePath`: checkpoint 檔案路徑，預設 `runtime/current-turn-state.json`
- `maxMessages`: 保存最近訊息數，預設 `8`
- `maxSnippetChars`: 每則訊息最大字數，預設 `320`
- `stateTtlMs`: checkpoint 有效時間，預設 `86400000`
- `alwaysRequireAlignment`: 是否永遠要求對齊，預設 `true`
- `captureGatewayStop`: 是否捕捉 gateway stop，預設 `true`
- `captureGatewayStart`: 是否捕捉 gateway start，預設 `true`
- `captureBeforeReset`: 是否捕捉 `/new` / `/reset`，預設 `true`
- `sensitivePatterns`: 偵測敏感工作的關鍵字清單

### 啟用

```bash
openclaw plugins enable compaction-state-guard
gateway restart
```

安裝時不要自動重啟 gateway，除非使用者明確同意。

## English

### Purpose

Compaction State Guard prevents an agent from continuing risky work after context compaction, gateway restart, `/new`, or `/reset` with incomplete state.

It writes a compact checkpoint and injects it on the next prompt build. The agent must reconstruct state, report its understanding, and wait for user confirmation before continuing side-effectful work.

### Supported Events

- `before_compaction`: saves a current-task checkpoint before compaction
- `gateway_stop`: saves a gateway restart checkpoint
- `gateway_start`: refreshes an existing restart checkpoint
- `before_reset`: saves a reset recovery checkpoint for `/new` and `/reset`
- `before_prompt_build`: injects the checkpoint once, then removes it

### `/new` / `/reset` Recovery

After `/new` or `/reset`, the plugin injects `needs_recovery`. The agent should first say:

```text
I will inspect the previous session for unfinished or ambiguous items first.
```

The agent should use injected recent messages first. If that is not enough, it should search recent LCM/session history. It must summarize the reconstructed state and wait for user confirmation.

Before confirmation, the agent must not apply patches, commit, restart services, deliver externally, handle credentials, or perform other side effects.

### Configuration

- `statePath`: checkpoint path, default `runtime/current-turn-state.json`
- `maxMessages`: number of recent messages to keep, default `8`
- `maxSnippetChars`: max chars per message, default `320`
- `stateTtlMs`: checkpoint TTL, default `86400000`
- `alwaysRequireAlignment`: always require alignment, default `true`
- `captureGatewayStop`: capture gateway stop, default `true`
- `captureGatewayStart`: capture gateway start, default `true`
- `captureBeforeReset`: capture `/new` and `/reset`, default `true`
- `sensitivePatterns`: patterns that mark work as sensitive

## 简体中文

### 用途

Compaction State Guard 用来避免 agent 在 context compaction、gateway restart、`/new`、`/reset` 之后，凭不完整记忆继续修改文件或执行高风险操作。

它会写入一份短 checkpoint，并在下一轮 prompt build 时注入。Agent 必须先重建状态、汇报理解、等待用户确认后再继续。

### 支持场景

- `before_compaction`: 压缩前保存当前任务
- `gateway_stop`: 保存 gateway restart checkpoint
- `gateway_start`: 刷新 restart checkpoint
- `before_reset`: 为 `/new` 和 `/reset` 保存 recovery checkpoint
- `before_prompt_build`: 注入一次 checkpoint 后删除

### `/new` / `/reset` Recovery

执行 `/new` 或 `/reset` 后，agent 应先说明会检查上一个 session 的未完成或待辨事项。它应先使用 injected recent messages，不够再查 recent LCM/session history。重建后必须先摘要并等待确认。

确认前禁止 patch、commit、重启服务、对外发送、处理 credential，或做任何 side effect 操作。

## 日本語

### 目的

Compaction State Guard は、context compaction、gateway restart、`/new`、`/reset` の後に、agent が不完全な状態のまま危険な作業を継続することを防ぐ OpenClaw plugin です。

短い checkpoint を保存し、次の prompt build で注入します。Agent は状態を復元し、理解した内容を報告し、ユーザー確認を待ってから作業を続けます。

### 対応イベント

- `before_compaction`: compaction 前に checkpoint を保存
- `gateway_stop`: gateway restart checkpoint を保存
- `gateway_start`: restart checkpoint を更新
- `before_reset`: `/new` と `/reset` の recovery checkpoint を保存
- `before_prompt_build`: checkpoint を一度だけ注入して削除

### `/new` / `/reset` Recovery

`/new` または `/reset` の後、agent はまず前 session の未完了・曖昧な事項を確認すると明示します。Injected recent messages を先に使い、不足する場合は recent LCM/session history を検索します。復元した状態を要約し、ユーザー確認を待つ必要があります。

確認前に patch、commit、service restart、external delivery、credential handling、その他 side effect を実行してはいけません。

## 한국어

### 목적

Compaction State Guard는 context compaction, gateway restart, `/new`, `/reset` 이후 agent가 불완전한 기억만으로 위험한 작업을 계속하는 것을 막는 OpenClaw plugin입니다.

짧은 checkpoint를 저장하고 다음 prompt build에서 주입합니다. Agent는 상태를 복원하고 이해한 내용을 보고한 뒤, 사용자 확인을 받은 후에만 계속 진행해야 합니다.

### 지원 이벤트

- `before_compaction`: compaction 전에 checkpoint 저장
- `gateway_stop`: gateway restart checkpoint 저장
- `gateway_start`: restart checkpoint 갱신
- `before_reset`: `/new`와 `/reset` recovery checkpoint 저장
- `before_prompt_build`: checkpoint를 한 번 주입한 뒤 삭제

### `/new` / `/reset` Recovery

`/new` 또는 `/reset` 이후 agent는 먼저 이전 session의 미완료 또는 모호한 항목을 확인하겠다고 말해야 합니다. Injected recent messages를 먼저 사용하고, 부족하면 recent LCM/session history를 검색합니다. 복원한 상태를 요약하고 사용자 확인을 기다려야 합니다.

확인 전에는 patch, commit, service restart, external delivery, credential handling, 기타 side effect 작업을 하면 안 됩니다.
