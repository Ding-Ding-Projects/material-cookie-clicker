import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaClientErrorCode,
  OllamaCopyModelRequest,
  OllamaDeleteModelRequest,
  OllamaGenerateRequest,
  OllamaGenerateResponse,
  OllamaHealthCheck,
  OllamaHealthError,
  OllamaHealthResponse,
  OllamaListModelsResponse,
  OllamaListRunningModelsResponse,
  OllamaLoopbackClientOptions,
  OllamaPullModelRequest,
  OllamaPullProgress,
  OllamaRequestOptions,
  OllamaShowModelRequest,
  OllamaShowModelResponse,
  OllamaVersionResponse,
} from "./types.ts";

const MEBIBYTE = 1024 * 1024;

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_STREAM_TIMEOUT_MS = 2 * 60 * 60 * 1_000;
const DEFAULT_MAX_REQUEST_BYTES = 16 * MEBIBYTE;
const DEFAULT_MAX_RESPONSE_BYTES = 32 * MEBIBYTE;
const DEFAULT_MAX_STREAM_BYTES = 256 * MEBIBYTE;
const DEFAULT_MAX_NDJSON_LINE_BYTES = 8 * MEBIBYTE;

const MAX_REQUEST_TIMEOUT_MS = 5 * 60 * 1_000;
const MAX_STREAM_TIMEOUT_MS = 24 * 60 * 60 * 1_000;
const MAX_REQUEST_BYTES = 64 * MEBIBYTE;
const MAX_RESPONSE_BYTES = 128 * MEBIBYTE;
const MAX_STREAM_BYTES = 1024 * MEBIBYTE;
const MAX_NDJSON_LINE_BYTES = 32 * MEBIBYTE;

type OllamaEndpoint =
  | "/api/chat"
  | "/api/copy"
  | "/api/delete"
  | "/api/generate"
  | "/api/ps"
  | "/api/pull"
  | "/api/show"
  | "/api/tags"
  | "/api/version";

type OllamaHttpMethod = "DELETE" | "GET" | "POST";

interface AbortContext {
  controller: AbortController;
  dispose: () => void;
  didTimeout: () => boolean;
}

interface OpenResponse {
  abortContext: AbortContext;
  response: Response;
}

export class OllamaClientError extends Error {
  public readonly code: OllamaClientErrorCode;

  public constructor(message: string, code: OllamaClientErrorCode, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.code = code;
    this.name = "OllamaClientError";
  }
}

export class OllamaHttpError extends OllamaClientError {
  public readonly status: number;
  public readonly endpoint: string;

  public constructor(message: string, status: number, endpoint: string) {
    super(message, "http");
    this.status = status;
    this.endpoint = endpoint;
    this.name = "OllamaHttpError";
  }
}

export class OllamaLoopbackClient {
  private readonly origin: string;
  private readonly requestTimeoutMs: number;
  private readonly streamTimeoutMs: number;
  private readonly maxRequestBytes: number;
  private readonly maxResponseBytes: number;
  private readonly maxStreamBytes: number;
  private readonly maxNdjsonLineBytes: number;
  private readonly encoder = new TextEncoder();

  public constructor(options: OllamaLoopbackClientOptions = {}) {
    const host = options.host ?? "127.0.0.1";
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new OllamaClientError(
        "Ollama host must be 127.0.0.1 or localhost.",
        "invalid_request",
      );
    }

    const port = boundedInteger("port", options.port, 11_434, 1, 65_535);
    this.origin = `http://${host}:${port}`;
    this.requestTimeoutMs = boundedInteger(
      "requestTimeoutMs",
      options.requestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1,
      MAX_REQUEST_TIMEOUT_MS,
    );
    this.streamTimeoutMs = boundedInteger(
      "streamTimeoutMs",
      options.streamTimeoutMs,
      DEFAULT_STREAM_TIMEOUT_MS,
      1,
      MAX_STREAM_TIMEOUT_MS,
    );
    this.maxRequestBytes = boundedInteger(
      "maxRequestBytes",
      options.maxRequestBytes,
      DEFAULT_MAX_REQUEST_BYTES,
      1,
      MAX_REQUEST_BYTES,
    );
    this.maxResponseBytes = boundedInteger(
      "maxResponseBytes",
      options.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      1,
      MAX_RESPONSE_BYTES,
    );
    this.maxStreamBytes = boundedInteger(
      "maxStreamBytes",
      options.maxStreamBytes,
      DEFAULT_MAX_STREAM_BYTES,
      1,
      MAX_STREAM_BYTES,
    );
    this.maxNdjsonLineBytes = boundedInteger(
      "maxNdjsonLineBytes",
      options.maxNdjsonLineBytes,
      DEFAULT_MAX_NDJSON_LINE_BYTES,
      1,
      MAX_NDJSON_LINE_BYTES,
    );
  }

  public async health(options: OllamaRequestOptions = {}): Promise<OllamaHealthResponse> {
    const checks = await Promise.allSettled([
      this.version(options),
      this.listModels(options),
      this.runningModels(options),
    ] as const);

    if (options.signal?.aborted) {
      throw new OllamaClientError(
        "Ollama health check was cancelled.",
        "cancelled",
        options.signal.reason,
      );
    }

    const [versionResult, installedResult, runningResult] = checks;
    const versionCheck = healthCheckFromResult(versionResult);
    const installedCheck = healthCheckFromResult(installedResult);
    const runningCheck = healthCheckFromResult(runningResult);
    const allHealthy = checks.every((result) => result.status === "fulfilled");
    const allUnreachable = checks.every(
      (result) =>
        result.status === "rejected" && isUnreachableError(result.reason),
    );

    return {
      status: allHealthy
        ? "healthy"
        : allUnreachable
          ? "missing-or-stopped"
          : "unhealthy",
      checkedAt: new Date().toISOString(),
      checks: {
        version: versionCheck,
        installedModels: installedCheck,
        runningModels: runningCheck,
      },
      ...(versionResult.status === "fulfilled"
        ? { version: versionResult.value }
        : {}),
      ...(installedResult.status === "fulfilled"
        ? { installedModels: installedResult.value }
        : {}),
      ...(runningResult.status === "fulfilled"
        ? { runningModels: runningResult.value }
        : {}),
    };
  }

  public async version(
    options: OllamaRequestOptions = {},
  ): Promise<OllamaVersionResponse> {
    return this.requestJson(
      "/api/version",
      "GET",
      undefined,
      options,
      validateVersionResponse,
    );
  }

  public async listModels(
    options: OllamaRequestOptions = {},
  ): Promise<OllamaListModelsResponse> {
    return this.requestJson(
      "/api/tags",
      "GET",
      undefined,
      options,
      validateListModelsResponse,
    );
  }

  public async runningModels(
    options: OllamaRequestOptions = {},
  ): Promise<OllamaListRunningModelsResponse> {
    return this.requestJson(
      "/api/ps",
      "GET",
      undefined,
      options,
      validateListRunningModelsResponse,
    );
  }

  public async show(
    request: OllamaShowModelRequest,
    options: OllamaRequestOptions = {},
  ): Promise<OllamaShowModelResponse> {
    assertLocalModelName(request.model, "model");
    return this.requestJson(
      "/api/show",
      "POST",
      request,
      options,
      validateShowModelResponse,
    );
  }

  public pull(
    request: OllamaPullModelRequest,
    options: OllamaRequestOptions = {},
  ): AsyncGenerator<OllamaPullProgress, void, undefined> {
    assertLocalModelName(request.model, "model");
    return this.requestStream(
      "/api/pull",
      "POST",
      { ...request, stream: true },
      options,
      validatePullProgress,
    );
  }

  public async deleteModel(
    request: OllamaDeleteModelRequest,
    options: OllamaRequestOptions = {},
  ): Promise<void> {
    assertLocalModelName(request.model, "model");
    await this.requestVoid("/api/delete", "DELETE", request, options);
  }

  public async copyModel(
    request: OllamaCopyModelRequest,
    options: OllamaRequestOptions = {},
  ): Promise<void> {
    assertLocalModelName(request.source, "source");
    assertLocalModelName(request.destination, "destination");
    await this.requestVoid("/api/copy", "POST", request, options);
  }

  public async generate(
    request: OllamaGenerateRequest,
    options: OllamaRequestOptions = {},
  ): Promise<OllamaGenerateResponse> {
    assertLocalModelName(request.model, "model");
    return this.requestJson(
      "/api/generate",
      "POST",
      { ...request, stream: false },
      options,
      validateGenerateResponse,
      this.streamTimeoutMs,
    );
  }

  public generateStream(
    request: OllamaGenerateRequest,
    options: OllamaRequestOptions = {},
  ): AsyncGenerator<OllamaGenerateResponse, void, undefined> {
    assertLocalModelName(request.model, "model");
    return this.requestStream(
      "/api/generate",
      "POST",
      { ...request, stream: true },
      options,
      validateGenerateResponse,
    );
  }

  public async chat(
    request: OllamaChatRequest,
    options: OllamaRequestOptions = {},
  ): Promise<OllamaChatResponse> {
    assertLocalModelName(request.model, "model");
    return this.requestJson(
      "/api/chat",
      "POST",
      { ...request, stream: false },
      options,
      validateChatResponse,
      this.streamTimeoutMs,
    );
  }

  public chatStream(
    request: OllamaChatRequest,
    options: OllamaRequestOptions = {},
  ): AsyncGenerator<OllamaChatResponse, void, undefined> {
    assertLocalModelName(request.model, "model");
    return this.requestStream(
      "/api/chat",
      "POST",
      { ...request, stream: true },
      options,
      validateChatResponse,
    );
  }

  private async requestJson<T>(
    endpoint: OllamaEndpoint,
    method: OllamaHttpMethod,
    body: unknown,
    options: OllamaRequestOptions,
    validate: (value: unknown) => T,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<T> {
    const opened = await this.openResponse(
      endpoint,
      method,
      body,
      options.signal,
      timeoutMs,
    );

    try {
      await this.ensureSuccess(opened.response, endpoint, options.signal, opened.abortContext);
      const text = await this.readResponseText(
        opened.response,
        this.maxResponseBytes,
        endpoint,
        options.signal,
        opened.abortContext,
      );
      return validate(parseJsonRecord(text, endpoint));
    } finally {
      opened.abortContext.dispose();
    }
  }

  private async requestVoid(
    endpoint: OllamaEndpoint,
    method: OllamaHttpMethod,
    body: unknown,
    options: OllamaRequestOptions,
  ): Promise<void> {
    const opened = await this.openResponse(
      endpoint,
      method,
      body,
      options.signal,
      this.requestTimeoutMs,
    );

    try {
      await this.ensureSuccess(opened.response, endpoint, options.signal, opened.abortContext);
      const text = await this.readResponseText(
        opened.response,
        this.maxResponseBytes,
        endpoint,
        options.signal,
        opened.abortContext,
      );
      if (text.trim().length > 0) {
        const value = parseJsonRecord(text, endpoint);
        throwIfApiError(value, endpoint);
      }
    } finally {
      opened.abortContext.dispose();
    }
  }

  private async *requestStream<T>(
    endpoint: OllamaEndpoint,
    method: OllamaHttpMethod,
    body: unknown,
    options: OllamaRequestOptions,
    validate: (value: unknown) => T,
  ): AsyncGenerator<T, void, undefined> {
    const opened = await this.openResponse(
      endpoint,
      method,
      body,
      options.signal,
      this.streamTimeoutMs,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      await this.ensureSuccess(opened.response, endpoint, options.signal, opened.abortContext);
      if (opened.response.body === null) {
        throw new OllamaClientError(
          `Ollama ${endpoint} returned no response stream.`,
          "protocol",
        );
      }

      reader = opened.response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let buffered = "";
      let receivedBytes = 0;

      while (true) {
        const result = await reader.read();
        if (result.done) {
          buffered += decoder.decode();
          break;
        }

        receivedBytes += result.value.byteLength;
        if (receivedBytes > this.maxStreamBytes) {
          throw new OllamaClientError(
            `Ollama ${endpoint} exceeded the ${this.maxStreamBytes}-byte stream limit.`,
            "response_too_large",
          );
        }

        buffered += decoder.decode(result.value, { stream: true });
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        this.assertLineWithinLimit(buffered, endpoint);

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) {
            continue;
          }
          this.assertLineWithinLimit(trimmed, endpoint);
          yield validate(parseJsonRecord(trimmed, endpoint));
        }
      }

      const trailing = buffered.trim();
      if (trailing.length > 0) {
        this.assertLineWithinLimit(trailing, endpoint);
        yield validate(parseJsonRecord(trailing, endpoint));
      }
    } catch (error) {
      throw this.mapTransportError(error, endpoint, options.signal, opened.abortContext);
    } finally {
      if (reader !== undefined) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed or aborted.
        }
        reader.releaseLock();
      }
      opened.abortContext.controller.abort();
      opened.abortContext.dispose();
    }
  }

  private async openResponse(
    endpoint: OllamaEndpoint,
    method: OllamaHttpMethod,
    body: unknown,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<OpenResponse> {
    const abortContext = createAbortContext(signal, timeoutMs);
    const headers: Record<string, string> = {
      Accept: "application/json, application/x-ndjson",
    };
    const init: RequestInit = {
      method,
      headers,
      signal: abortContext.controller.signal,
      credentials: "omit",
      redirect: "error",
    };

    if (body !== undefined) {
      const encoded = this.encodeRequestBody(body);
      headers["Content-Type"] = "application/json";
      init.body = encoded;
    }

    try {
      const response = await fetch(`${this.origin}${endpoint}`, init);
      if (new URL(response.url).origin !== this.origin) {
        throw new OllamaClientError(
          `Ollama ${endpoint} response changed origin.`,
          "protocol",
        );
      }
      return { abortContext, response };
    } catch (error) {
      abortContext.dispose();
      throw this.mapTransportError(error, endpoint, signal, abortContext);
    }
  }

  private encodeRequestBody(body: unknown): string {
    let encoded: string;
    try {
      const value = JSON.stringify(body);
      if (value === undefined) {
        throw new TypeError("Request body is not JSON serializable.");
      }
      encoded = value;
    } catch (error) {
      throw new OllamaClientError(
        "Ollama request body must be valid JSON.",
        "invalid_request",
        error,
      );
    }

    const bytes = this.encoder.encode(encoded).byteLength;
    if (bytes > this.maxRequestBytes) {
      throw new OllamaClientError(
        `Ollama request exceeded the ${this.maxRequestBytes}-byte request limit.`,
        "invalid_request",
      );
    }
    return encoded;
  }

  private async ensureSuccess(
    response: Response,
    endpoint: OllamaEndpoint,
    signal: AbortSignal | undefined,
    abortContext: AbortContext,
  ): Promise<void> {
    if (response.ok) {
      return;
    }

    let message = response.statusText || `HTTP ${response.status}`;
    try {
      const text = await this.readResponseText(
        response,
        this.maxResponseBytes,
        endpoint,
        signal,
        abortContext,
      );
      const parsed = text.trim().length > 0 ? JSON.parse(text) : undefined;
      if (isRecord(parsed) && typeof parsed.error === "string") {
        message = parsed.error;
      }
    } catch (error) {
      if (
        error instanceof OllamaClientError &&
        (error.code === "cancelled" || error.code === "timeout")
      ) {
        throw error;
      }
    }

    throw new OllamaHttpError(
      `Ollama ${endpoint} returned HTTP ${response.status}: ${message}`,
      response.status,
      endpoint,
    );
  }

  private async readResponseText(
    response: Response,
    byteLimit: number,
    endpoint: OllamaEndpoint,
    signal: AbortSignal | undefined,
    abortContext: AbortContext,
  ): Promise<string> {
    if (response.body === null) {
      return "";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let receivedBytes = 0;
    let text = "";

    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          text += decoder.decode();
          return text;
        }

        receivedBytes += result.value.byteLength;
        if (receivedBytes > byteLimit) {
          throw new OllamaClientError(
            `Ollama ${endpoint} exceeded the ${byteLimit}-byte response limit.`,
            "response_too_large",
          );
        }
        text += decoder.decode(result.value, { stream: true });
      }
    } catch (error) {
      throw this.mapTransportError(error, endpoint, signal, abortContext);
    } finally {
      try {
        await reader.cancel();
      } catch {
        // The response may already be closed or aborted.
      }
      reader.releaseLock();
    }
  }

  private assertLineWithinLimit(line: string, endpoint: OllamaEndpoint): void {
    if (this.encoder.encode(line).byteLength > this.maxNdjsonLineBytes) {
      throw new OllamaClientError(
        `Ollama ${endpoint} returned an NDJSON line larger than ${this.maxNdjsonLineBytes} bytes.`,
        "response_too_large",
      );
    }
  }

  private mapTransportError(
    error: unknown,
    endpoint: OllamaEndpoint,
    signal: AbortSignal | undefined,
    abortContext: AbortContext,
  ): OllamaClientError {
    if (error instanceof OllamaClientError) {
      return error;
    }
    if (signal?.aborted) {
      return new OllamaClientError(
        `Ollama ${endpoint} request was cancelled.`,
        "cancelled",
        signal.reason,
      );
    }
    if (abortContext.didTimeout()) {
      return new OllamaClientError(
        `Ollama ${endpoint} request timed out.`,
        "timeout",
        error,
      );
    }
    if (error instanceof SyntaxError || error instanceof TypeError) {
      return new OllamaClientError(
        `Ollama ${endpoint} returned an unreadable response.`,
        error instanceof SyntaxError ? "protocol" : "network",
        error,
      );
    }
    return new OllamaClientError(
      `Ollama ${endpoint} request failed.`,
      "network",
      error,
    );
  }
}

function boundedInteger(
  name: string,
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate < minimum || candidate > maximum) {
    throw new OllamaClientError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
      "invalid_request",
    );
  }
  return candidate;
}

function createAbortContext(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortContext {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = (): void => controller.abort(signal?.reason);

  if (signal?.aborted) {
    onAbort();
  } else {
    signal?.addEventListener("abort", onAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function assertLocalModelName(model: string, field: string): void {
  if (
    typeof model !== "string" ||
    model.length === 0 ||
    model.length > 512 ||
    model.trim() !== model ||
    /[\u0000-\u001f\u007f\\]/u.test(model) ||
    model.includes("://")
  ) {
    throw new OllamaClientError(
      `${field} must be a valid local Ollama model name.`,
      "invalid_request",
    );
  }

  // Ollama documents the :cloud suffix for models executed by its cloud service.
  if (/(?:^|[:._/-])cloud(?:$|[:._/-])/iu.test(model)) {
    throw new OllamaClientError(
      `${field} must refer to a local model, not an Ollama cloud model.`,
      "invalid_request",
    );
  }
}

function parseJsonRecord(text: string, endpoint: OllamaEndpoint): Record<string, unknown> {
  if (text.trim().length === 0) {
    throw new OllamaClientError(
      `Ollama ${endpoint} returned an empty JSON response.`,
      "protocol",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new OllamaClientError(
      `Ollama ${endpoint} returned invalid JSON.`,
      "protocol",
      error,
    );
  }

  const record = requireRecord(value, `Ollama ${endpoint} response`);
  throwIfApiError(record, endpoint);
  return record;
}

function throwIfApiError(value: Record<string, unknown>, endpoint: OllamaEndpoint): void {
  if (typeof value.error === "string") {
    throw new OllamaClientError(
      `Ollama ${endpoint} returned an error: ${value.error}`,
      "protocol",
    );
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new OllamaClientError(`${label} must be a JSON object.`, "protocol");
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new OllamaClientError(`${label}.${key} must be a string.`, "protocol");
  }
  return value;
}

function requireBoolean(record: Record<string, unknown>, key: string, label: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new OllamaClientError(`${label}.${key} must be a boolean.`, "protocol");
  }
  return value;
}

function requireArray(record: Record<string, unknown>, key: string, label: string): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new OllamaClientError(`${label}.${key} must be an array.`, "protocol");
  }
  return value;
}

function validateVersionResponse(value: unknown): OllamaVersionResponse {
  const record = requireRecord(value, "Ollama version response");
  requireString(record, "version", "Ollama version response");
  return record as unknown as OllamaVersionResponse;
}

function validateListModelsResponse(value: unknown): OllamaListModelsResponse {
  const record = requireRecord(value, "Ollama model list response");
  const models = requireArray(record, "models", "Ollama model list response");
  for (const model of models) {
    const item = requireRecord(model, "Ollama model list item");
    requireString(item, "name", "Ollama model list item");
    requireString(item, "model", "Ollama model list item");
  }
  return record as unknown as OllamaListModelsResponse;
}

function validateListRunningModelsResponse(
  value: unknown,
): OllamaListRunningModelsResponse {
  const record = requireRecord(value, "Ollama running-model list response");
  const models = requireArray(record, "models", "Ollama running-model list response");
  for (const model of models) {
    const item = requireRecord(model, "Ollama running-model list item");
    requireString(item, "name", "Ollama running-model list item");
    requireString(item, "model", "Ollama running-model list item");
  }
  return record as unknown as OllamaListRunningModelsResponse;
}

function validateShowModelResponse(value: unknown): OllamaShowModelResponse {
  const record = requireRecord(value, "Ollama model-details response");
  if (
    record.capabilities !== undefined &&
    (!Array.isArray(record.capabilities) ||
      !record.capabilities.every((capability) => typeof capability === "string"))
  ) {
    throw new OllamaClientError(
      "Ollama model-details response.capabilities must be an array of strings.",
      "protocol",
    );
  }
  if (record.model_info !== undefined) {
    requireRecord(record.model_info, "Ollama model-details response.model_info");
  }
  return record as unknown as OllamaShowModelResponse;
}

function validatePullProgress(value: unknown): OllamaPullProgress {
  const record = requireRecord(value, "Ollama pull progress");
  requireString(record, "status", "Ollama pull progress");
  return record as unknown as OllamaPullProgress;
}

function validateGenerateResponse(value: unknown): OllamaGenerateResponse {
  const record = requireRecord(value, "Ollama generate response");
  requireString(record, "model", "Ollama generate response");
  requireString(record, "created_at", "Ollama generate response");
  requireString(record, "response", "Ollama generate response");
  requireBoolean(record, "done", "Ollama generate response");
  return record as unknown as OllamaGenerateResponse;
}

function validateChatResponse(value: unknown): OllamaChatResponse {
  const record = requireRecord(value, "Ollama chat response");
  requireString(record, "model", "Ollama chat response");
  requireString(record, "created_at", "Ollama chat response");
  requireBoolean(record, "done", "Ollama chat response");
  const message = requireRecord(record.message, "Ollama chat response.message");
  requireString(message, "role", "Ollama chat response.message");
  requireString(message, "content", "Ollama chat response.message");
  return record as unknown as OllamaChatResponse;
}

function healthCheckFromResult<T>(result: PromiseSettledResult<T>): OllamaHealthCheck {
  if (result.status === "fulfilled") {
    return { ok: true };
  }
  return { ok: false, error: healthErrorFromUnknown(result.reason) };
}

function healthErrorFromUnknown(error: unknown): OllamaHealthError {
  if (error instanceof OllamaHttpError) {
    return { code: error.code, message: error.message, httpStatus: error.status };
  }
  if (error instanceof OllamaClientError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "unknown",
    message: error instanceof Error ? error.message : "Unknown Ollama health-check error.",
  };
}

function isUnreachableError(error: unknown): boolean {
  return (
    error instanceof OllamaClientError &&
    (error.code === "network" || error.code === "timeout")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
