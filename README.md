# Compaction State Guard

Compaction State Guard is a default-off OpenClaw plugin that records a compact recovery checkpoint before context compaction, gateway lifecycle changes, and `/new` or `/reset` session resets.

It helps OpenClaw hosts make recovery behavior explicit after state-disrupting events.

## Documentation

- English: this file
- Traditional Chinese: [docs/README.zh-TW.md](docs/README.zh-TW.md)
- Simplified Chinese: [docs/README.zh-CN.md](docs/README.zh-CN.md)
- Japanese: [docs/README.ja.md](docs/README.ja.md)
- Korean: [docs/README.ko.md](docs/README.ko.md)

## Features

- Captures a current-task checkpoint before context compaction
- Captures gateway stop/start recovery state
- Captures `/new` and `/reset` recovery state through `before_reset`
- Injects the checkpoint once during `before_prompt_build`
- Stores short recent-message snippets to support reconstruction

## Supported Events

- `before_compaction`
- `gateway_stop`
- `gateway_start`
- `before_reset`
- `before_prompt_build`

## Configuration

- `statePath`: checkpoint path, default `runtime/current-turn-state.json`
- `maxMessages`: number of recent messages to keep, default `8`
- `maxSnippetChars`: max chars per message, default `320`
- `stateTtlMs`: checkpoint TTL, default `86400000`
- `alwaysRequireAlignment`: mark checkpoints as requiring alignment, default `true`
- `captureGatewayStop`: capture gateway stop, default `true`
- `captureGatewayStart`: capture gateway start, default `true`
- `captureBeforeReset`: capture `/new` and `/reset`, default `true`
- `sensitivePatterns`: patterns used to detect sensitive work

## Recovery Checkpoint

The plugin injects structured recovery context like:

```json
{
  "schema": "openclaw.compaction-state.v1",
  "trigger": "before_reset:new",
  "currentMode": "needs_recovery",
  "activeTask": "Inferred from recent user messages",
  "recentMessages": []
}
```

The checkpoint is advisory context. Host policies, agent instructions, and application code decide how strictly to enforce recovery behavior.

## Development

```bash
npm test
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
