# Compaction State Guard

Compaction State Guard 是一个默认关闭的 OpenClaw plugin，会在 context compaction、gateway lifecycle 变化、`/new` 或 `/reset` session reset 前记录短 recovery checkpoint。

它让 OpenClaw host 在状态中断后，可以明确取得恢复上下文。

## 功能

- 在 context compaction 前捕捉 current-task checkpoint
- 捕捉 gateway stop/start recovery state
- 通过 `before_reset` 捕捉 `/new` 和 `/reset`
- 在 `before_prompt_build` 注入一次 checkpoint
- 保存短 recent-message snippets 以协助重建状态

## 支持事件

- `before_compaction`
- `gateway_stop`
- `gateway_start`
- `before_reset`
- `before_prompt_build`

## 配置

- `statePath`: checkpoint 路径，默认 `runtime/current-turn-state.json`
- `maxMessages`: 保存最近消息数，默认 `8`
- `maxSnippetChars`: 每条消息最大字数，默认 `320`
- `stateTtlMs`: checkpoint TTL，默认 `86400000`
- `alwaysRequireAlignment`: 将 checkpoint 标记为需要 alignment，默认 `true`
- `captureGatewayStop`: 捕捉 gateway stop，默认 `true`
- `captureGatewayStart`: 捕捉 gateway start，默认 `true`
- `captureBeforeReset`: 捕捉 `/new` 和 `/reset`，默认 `true`
- `sensitivePatterns`: 检测 sensitive work 的 pattern

## Recovery Checkpoint

Checkpoint 是 advisory context。Host policies、agent instructions 与 application code 会决定实际 recovery 行为。

## 开发

```bash
npm test
```

## 许可证

MIT. See [LICENSE](../LICENSE).
