# OpenCode local-embedding runtime check (2026-10-05)

## Release/runtime finding

The newest OpenCode 1.x release available on 2026-10-05 is **v1.18.34** ([GitHub release](https://github.com/anomalyco/opencode/releases/tag/v1.18.34), published 2026-09-30). Its tagged [`package.json`](https://github.com/anomalyco/opencode/blob/v1.18.34/package.json) declares `"packageManager": "bun@1.3.14"`. The preceding control release, [v1.18.30](https://github.com/anomalyco/opencode/releases/tag/v1.18.30), declares the same Bun package-manager version.

I downloaded the official macOS arm64 release binaries and independently measured their embedded runtime from a temporary plugin loaded by each live `opencode serve` process. Both reported:

```text
[bun-probe] Bun=1.3.14 process.versions.bun=1.3.14
```

Thus the premise that the newest released OpenCode 1.x embeds Bun >=1.4.0 is not true for the release inspected. There is no new-Bun 1.x release on which to confirm native auto-selection. No native attempt was made on v1.18.34, and no native-load error was observed; the auto-selection branch correctly chose WASM for Bun 1.3.14.

## Isolated host runs

Both releases were run with `embedding.provider: "local"`, `embedding.local_runtime: "auto"`, memory enabled, and the model provider restricted to a local mock Anthropic-compatible server. No real LLM provider was configured or contacted. The local MiniLM model was available in the throwaway storage (`modelCacheBytes: 91,100,283`).

| Host | Embedded Bun observed in host | Doctor embedding probe | Plugin/runtime evidence |
|---|---:|---|---|
| OpenCode **1.18.34** (latest 1.x) | 1.3.14 | `Embedding provider: local — onnxruntime-web (WASM) selected by embedding.local_runtime/host ... Doctor process Bun 1.3.14 (the host's embedded Bun may differ). The native addon was not probed or loaded.` | Plugin log: `[magic-context] embedding model loaded: Xenova/all-MiniLM-L6-v2`; `debug.memoryUsage` reported `loaded:true`, `runtimes:["wasm"]`, `providerCount:1`. |
| OpenCode **1.18.30** (requested control) | 1.3.14 | The same WASM-selected line and `Doctor process Bun 1.3.14`; native addon not probed. | Plugin log showed model load; `debug.memoryUsage` reported `loaded:true`, `runtimes:["wasm"]`, `providerCount:1`. |

The provider was exercised, not just initialized: each host's `ctx_memory` write returned `Saved memory [ID: 1] in ARCHITECTURE` and computed/persisted one local embedding (`memory_embeddings` row count 1). The subsequent `ctx_search` returned `Memories: 1 match found, all already visible in your project-memory block (ids 1)`. It matched the written memory, but Magic Context suppressed its content because it was already in the project-memory block.

An additional v1.18.30 run set `local_runtime: "native"` explicitly to exercise the guard rather than auto-selection. The plugin logged:

```text
[magic-context] native embedding worker teardown is unsafe on this Bun version; using WASM. Upgrade the host to Bun >=1.4.0 for native inference.
```

That run also computed an embedding and reported `runtimes:["wasm"]`. On the auto path, the current plugin does not log a runtime-named success line; the generic `embedding model loaded` line and the runtime statistics are the available plugin-side evidence. The explicit-native guard run supplies the requested runtime-named plugin log line for the old-Bun control.

## Live-store isolation

Each host's `HOME`, XDG config/data/cache/state/runtime roots, `OPENCODE_DB`, and `MAGIC_CONTEXT_STORAGE_DIR` were under `$TMPDIR/magic-context/verify-native-local-embeddings/`. The recorded `lsof -p <host pid>` database descriptors for every host were only throwaway `opencode.db` and `context.db` files and their WAL/SHM companions beneath that task root. The probe asserted this containment for the host PIDs (latest 78004, auto control 16351, explicit-native control 23705). No live OpenCode or Magic Context store/config path was opened or changed. `doctor` made its normal temporary TUI config repair only inside the throwaway roots.

## Recommendation / adoption data

**Keep the Bun <1.4 WASM injection arm.** Both the newest published OpenCode 1.x release and v1.18.30 still embed Bun 1.3.14, and the v1.18.30 control demonstrably selects and executes WASM. Revisit retirement only after a released OpenCode 1.x binary embeds Bun >=1.4.0 and the native path is verified on that binary.

The number of users still on older OpenCode/Bun versions is **unknown**. Release tags and asset-download totals do not identify active installs or which downloaded version a user currently runs; no release-note or public GitHub data found here supports a user count.

## Scope

No product code was changed. This report is the only repository change. All downloaded binaries, temporary drivers, host configs, databases, model cache, and logs remain under the task's throwaway temp root.
