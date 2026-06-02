# Compaction State Guard

Compaction State Guard は、context compaction、gateway lifecycle changes、`/new` または `/reset` session reset の前に短い recovery checkpoint を記録する、default-off OpenClaw plugin です。

OpenClaw host が状態中断後の recovery context を明示的に扱えるようにします。

## 機能

- context compaction 前に current-task checkpoint を取得
- gateway stop/start recovery state を取得
- `before_reset` で `/new` と `/reset` を取得
- `before_prompt_build` で checkpoint を一度だけ注入
- reconstruction を助ける short recent-message snippets を保存

## Supported Events

- `before_compaction`
- `gateway_stop`
- `gateway_start`
- `before_reset`
- `before_prompt_build`

## Configuration

- `statePath`: checkpoint path, default `runtime/current-turn-state.json`
- `maxMessages`: recent messages count, default `8`
- `maxSnippetChars`: max chars per message, default `320`
- `stateTtlMs`: checkpoint TTL, default `86400000`
- `alwaysRequireAlignment`: mark checkpoints as requiring alignment, default `true`
- `captureGatewayStop`: capture gateway stop, default `true`
- `captureGatewayStart`: capture gateway start, default `true`
- `captureBeforeReset`: capture `/new` and `/reset`, default `true`
- `sensitivePatterns`: patterns for sensitive work detection

## Recovery Checkpoint

Checkpoint は advisory context です。実際の recovery behavior は host policies、agent instructions、application code が決定します。

## Development

```bash
npm test
```

## License

MIT. See [LICENSE](../LICENSE).
