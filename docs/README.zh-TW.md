# Compaction State Guard

Compaction State Guard 是一個預設關閉的 OpenClaw plugin，會在 context compaction、gateway lifecycle 變化、`/new` 或 `/reset` session reset 前記錄短 recovery checkpoint。

它讓 OpenClaw host 在狀態中斷後，可以明確取得恢復上下文。

## 功能

- 在 context compaction 前捕捉 current-task checkpoint
- 捕捉 gateway stop/start recovery state
- 透過 `before_reset` 捕捉 `/new` 和 `/reset`
- 在 `before_prompt_build` 注入一次 checkpoint
- 儲存短 recent-message snippets 以協助重建狀態

## 支援事件

- `before_compaction`
- `gateway_stop`
- `gateway_start`
- `before_reset`
- `before_prompt_build`

## 設定

- `statePath`: checkpoint 路徑，預設 `runtime/current-turn-state.json`
- `maxMessages`: 保存最近訊息數，預設 `8`
- `maxSnippetChars`: 每則訊息最大字數，預設 `320`
- `stateTtlMs`: checkpoint TTL，預設 `86400000`
- `alwaysRequireAlignment`: 將 checkpoint 標記為需要 alignment，預設 `true`
- `captureGatewayStop`: 捕捉 gateway stop，預設 `true`
- `captureGatewayStart`: 捕捉 gateway start，預設 `true`
- `captureBeforeReset`: 捕捉 `/new` 和 `/reset`，預設 `true`
- `sensitivePatterns`: 偵測 sensitive work 的 pattern

## Recovery Checkpoint

Checkpoint 是 advisory context。Host policies、agent instructions 與 application code 會決定實際 recovery 行為。

## 開發

```bash
npm test
```

## 授權

MIT. See [LICENSE](../LICENSE).
