# Compaction State Guard

Compaction State Guard는 context compaction, gateway lifecycle changes, `/new` 또는 `/reset` session reset 전에 짧은 recovery checkpoint를 기록하는 default-off OpenClaw plugin입니다.

OpenClaw host가 상태 중단 이후 recovery context를 명시적으로 다룰 수 있게 합니다.

## 기능

- context compaction 전에 current-task checkpoint 캡처
- gateway stop/start recovery state 캡처
- `before_reset`으로 `/new`와 `/reset` 캡처
- `before_prompt_build`에서 checkpoint를 한 번 주입
- reconstruction을 돕는 short recent-message snippets 저장

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

Checkpoint는 advisory context입니다. 실제 recovery behavior는 host policies, agent instructions, application code가 결정합니다.

## Development

```bash
npm test
```

## License

MIT. See [LICENSE](../LICENSE).
