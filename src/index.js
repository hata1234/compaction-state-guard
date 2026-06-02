import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import { cwd } from "node:process";
import {
  buildCompactionState,
  buildGatewayState,
  buildResetState,
  formatInjectedState,
  isFreshState,
  resolveConfig,
} from "./state.js";

function resolveStatePath(config) {
  return isAbsolute(config.statePath) ? config.statePath : join(cwd(), config.statePath);
}

async function writeStateFile(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function readStateFile(path) {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

export default definePluginEntry({
  id: "compaction-state-guard",
  name: "Compaction State Guard",
  version: "0.1.0",
  register(api) {
    const config = resolveConfig(api);
    if (!config.enabled) return;
    const statePath = resolveStatePath(config);

    api.on("gateway_stop", async (event, ctx) => {
      if (!config.captureGatewayStop) return;
      try {
        let previousState;
        try {
          previousState = await readStateFile(statePath);
        } catch {
          previousState = undefined;
        }
        const state = buildGatewayState({ event, ctx, config, phase: "stop", previousState });
        await writeStateFile(statePath, state);
        api.log?.info?.(`compaction-state-guard: wrote gateway checkpoint ${statePath}`);
      } catch (error) {
        api.log?.warn?.(`compaction-state-guard: failed to write gateway checkpoint: ${String(error)}`);
      }
    });

    api.on("gateway_start", async (event, ctx) => {
      if (!config.captureGatewayStart) return;
      try {
        const state = await readStateFile(statePath);
        if (!isFreshState(state, ctx, config.stateTtlMs)) return;
        const updated = buildGatewayState({ event, ctx, config, phase: "start", previousState: state });
        await writeStateFile(statePath, updated);
        api.log?.info?.("compaction-state-guard: gateway checkpoint is ready for next prompt");
      } catch {
        // Best effort only. Missing state means there is nothing to recover.
      }
    });

    api.on("before_compaction", async (event, ctx) => {
      try {
        const state = buildCompactionState({ event, ctx, config });
        await writeStateFile(statePath, state);
        api.log?.info?.(`compaction-state-guard: wrote ${statePath}`);
      } catch (error) {
        api.log?.warn?.(`compaction-state-guard: failed to write state: ${String(error)}`);
      }
    });

    api.on("after_compaction", async (_event, ctx) => {
      try {
        const state = await readStateFile(statePath);
        if (!isFreshState(state, ctx, config.stateTtlMs)) return;
        api.log?.info?.("compaction-state-guard: post-compaction state is ready for next prompt");
      } catch {
        // Best effort only. The before_prompt_build hook handles missing state.
      }
    });

    api.on("before_reset", async (event, ctx) => {
      if (!config.captureBeforeReset) return;
      try {
        const state = buildResetState({ event, ctx, config });
        await writeStateFile(statePath, state);
        api.log?.info?.(`compaction-state-guard: wrote reset checkpoint ${statePath}`);
      } catch (error) {
        api.log?.warn?.(`compaction-state-guard: failed to write reset checkpoint: ${String(error)}`);
      }
    });

    api.on("before_prompt_build", async (_event, ctx) => {
      try {
        const state = await readStateFile(statePath);
        if (!isFreshState(state, ctx, config.stateTtlMs)) return;
        await unlink(statePath).catch(() => undefined);
        return { prependContext: formatInjectedState(state) };
      } catch {
        return undefined;
      }
    }, { priority: 50 });
  },
});
