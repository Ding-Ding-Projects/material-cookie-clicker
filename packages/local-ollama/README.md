# Local Ollama suite

`@oak-kay/local-ollama` is a framework-neutral TypeScript package for a local Ollama model store, durable pull queue, streamed chat, conservative hardware-fit evidence, and allowlisted local harness launches. It includes an accessible browser-style tab surface that a future privileged Windows desktop shell can mount.

## Runtime boundary

- Local inference requests are fixed to `http://127.0.0.1:11434` or `http://localhost:11434` and to documented `/api/*` endpoints.
- There is no configurable remote host, cloud model fallback, arbitrary URL, unofficial proxy, shell command, payment, purchase, account, or entitlement path.
- Model names carrying a cloud marker are rejected at the privileged boundary.
- Request bodies, JSON responses, NDJSON streams, individual stream lines, ports, and timeouts are bounded. All streaming operations accept cancellation.
- An unavailable HTTP API is reported as `missing-or-stopped` unless a privileged installation probe can establish which state applies.

The loopback client covers version, installed models, running models, model details and capabilities, streamed pulls, deletes, copies, generation, and chat through Ollama's documented local HTTP API.

## Official model store

The catalog refresher reads only `https://ollama.com/library` and official per-model tag pages. It follows advertised pagination, records source URLs and response identity, timestamps each complete refresh, counts model and tag pages, and marks completeness and staleness explicitly. It never writes an incomplete refresh over the last verified cache. Offline operation keeps the last verified catalog and current locally installed models available.

Search is plain text by default and includes an adjacent JavaScript regular-expression builder. Model, tag, parameter size, quantization, installed/running state, capability, and hardware-fit evidence are separate facts; missing evidence produces `Unknown` rather than a guessed result.

## Pull queue

The model cart is a local batch-pull queue, not commerce. It persists each item, pages queue discovery, processes bounded-concurrency chunks, storage-preflights every pull, streams byte progress where the API provides it, and supports pause, resume, cancel, retry, crash recovery, and reconciliation with installed state. The store contract does not require loading every queued path or record into memory.

## Local chat and tax-data review

Chat sessions use an explicit installed model, bounded history, an editable system prompt, validated options, streaming, stop, and redacted export. Image attachments remain unavailable unless the selected model reports `vision` capability.

A chat submission flagged as containing tax data is refused until the user explicitly confirms that they reviewed the exact content and approve processing by the selected local model. Chat and generation never call the official catalog host. The official catalog refresh sends no prompt, chat history, attachment, return data, taxpayer identifier, or document content.

This package does not electronically file, transmit to the CRA, implement NETFILE or EFILE, or remove the project's mandatory manual review and paper-mailing boundary.

## Harness boundary

Harnesses are application-owned orchestration, not an Ollama capability. Only committed prebuilt profiles and privileged executable discovery are accepted. Each launch provides a reviewable preview, uses `useShell: false`, allowlists argument templates and environment keys, snapshots configuration before mutation, waits for readiness, and restores the snapshot automatically after a launch failure. Arbitrary commands, scripts, concatenation, and environment expansion are not accepted.

## Integration

1. Construct `OllamaLoopbackClient` inside the privileged process.
2. Wrap it with `OllamaPrivilegedBridgeAdapter` and expose only the narrow bridge methods to the renderer.
3. Provide durable catalog, queue, chat, and snapshot stores plus platform hardware, storage, executable, and folder-picker adapters.
4. Construct `LocalOllamaSuiteController`, call `initialize()`, and mount `mountLocalOllamaSuiteSurface` into the renderer container.
5. Load `src/surface.css` through the application's normal bundled-style path.

## Failure modes

- Missing or stopped service: installed/catalog/history/profile surfaces remain available and the troubleshooter gives the exact next action.
- Unhealthy API: individual failed endpoint details remain visible; no cloud service is substituted.
- Offline catalog: the last verified cache is marked stale and retained.
- Incomplete catalog traversal: the refresh is rejected without replacing the verified cache.
- Missing model size or storage evidence: pull admission is refused rather than guessed.
- Missing hardware evidence: fit is `Unknown`.
- Pull interruption: durable items return to a reconcilable state.
- Harness launch/readiness failure: the process is stopped when possible and the pre-launch snapshot is restored.

## Official sources

- [API introduction and loopback base URL](https://docs.ollama.com/api/introduction)
- [Streaming](https://docs.ollama.com/api/streaming)
- [Generate](https://docs.ollama.com/api/generate)
- [Chat](https://docs.ollama.com/api/chat)
- [List installed models](https://docs.ollama.com/api/tags)
- [List running models](https://docs.ollama.com/api/ps)
- [Show model details and capabilities](https://docs.ollama.com/api-reference/show-model-details)
- [Pull a model](https://docs.ollama.com/api/pull)
- [Copy a model](https://docs.ollama.com/api/copy)
- [Delete a model](https://docs.ollama.com/api/delete)
- [Get version](https://docs.ollama.com/api-reference/get-version)
- [Official model library](https://ollama.com/library)

## Verification status

This ultra-speed implementation pass intentionally did not run tests, lint, type checks, builds, runtime interaction, or captures. The package is not yet wired into a shipped application or installer.
