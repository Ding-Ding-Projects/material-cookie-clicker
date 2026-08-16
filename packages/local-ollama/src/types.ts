export type OllamaLoopbackHost = "127.0.0.1" | "localhost";

export type OllamaJsonPrimitive = boolean | number | string | null;

export type OllamaJsonValue =
  | OllamaJsonPrimitive
  | OllamaJsonValue[]
  | { [key: string]: OllamaJsonValue };

export type OllamaJsonObject = { [key: string]: OllamaJsonValue };

export interface OllamaLoopbackClientOptions {
  host?: OllamaLoopbackHost;
  port?: number;
  requestTimeoutMs?: number;
  streamTimeoutMs?: number;
  maxRequestBytes?: number;
  maxResponseBytes?: number;
  maxStreamBytes?: number;
  maxNdjsonLineBytes?: number;
}

export interface OllamaRequestOptions {
  signal?: AbortSignal;
}

export interface OllamaVersionResponse {
  version: string;
}

export interface OllamaModelDetails {
  parent_model?: string;
  format: string;
  family: string;
  families: string[];
  parameter_size: string;
  quantization_level: string;
}

export interface OllamaModelSummary {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
}

export interface OllamaListModelsResponse {
  models: OllamaModelSummary[];
}

export interface OllamaRunningModelSummary {
  name: string;
  model: string;
  size: number;
  digest: string;
  details: OllamaModelDetails;
  expires_at: string;
  size_vram: number;
  context_length: number;
}

export interface OllamaListRunningModelsResponse {
  models: OllamaRunningModelSummary[];
}

export interface OllamaShowModelRequest {
  model: string;
  verbose?: boolean;
}

export interface OllamaShowModelResponse {
  parameters?: string;
  license?: string;
  modified_at?: string;
  template?: string;
  system?: string;
  details?: OllamaModelDetails;
  capabilities?: string[];
  model_info?: OllamaJsonObject;
  projector_info?: OllamaJsonObject;
  tensors?: OllamaJsonValue[];
}

export interface OllamaPullModelRequest {
  model: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface OllamaDeleteModelRequest {
  model: string;
}

export interface OllamaCopyModelRequest {
  source: string;
  destination: string;
}

export type OllamaStructuredFormat = "json" | OllamaJsonObject;
export type OllamaThinkMode = boolean | "low" | "medium" | "high" | "max";
export type OllamaKeepAlive = number | string;

export interface OllamaLogprobAlternative {
  token: string;
  logprob: number;
  bytes?: number[];
}

export interface OllamaLogprob extends OllamaLogprobAlternative {
  top_logprobs?: OllamaLogprobAlternative[];
}

export interface OllamaResponseMetrics {
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaGenerateRequest {
  model: string;
  prompt?: string;
  suffix?: string;
  images?: string[];
  format?: OllamaStructuredFormat;
  system?: string;
  raw?: boolean;
  keep_alive?: OllamaKeepAlive;
  options?: OllamaJsonObject;
  think?: OllamaThinkMode;
  logprobs?: boolean;
  top_logprobs?: number;
}

export interface OllamaGenerateResponse extends OllamaResponseMetrics {
  model: string;
  created_at: string;
  response: string;
  thinking?: string;
  done: boolean;
  done_reason?: string;
  context?: number[];
  logprobs?: OllamaLogprob[];
}

export type OllamaChatRole = "assistant" | "system" | "tool" | "user";

export interface OllamaToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: OllamaJsonObject;
  };
}

export interface OllamaToolCall {
  function: {
    name: string;
    description?: string;
    arguments: OllamaJsonObject;
  };
}

export interface OllamaChatMessage {
  role: OllamaChatRole;
  content: string;
  thinking?: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  tools?: OllamaToolDefinition[];
  format?: OllamaStructuredFormat;
  options?: OllamaJsonObject;
  think?: OllamaThinkMode;
  keep_alive?: OllamaKeepAlive;
  logprobs?: boolean;
  top_logprobs?: number;
}

export interface OllamaChatResponse extends OllamaResponseMetrics {
  model: string;
  created_at: string;
  message: OllamaChatMessage;
  done: boolean;
  done_reason?: string;
  logprobs?: OllamaLogprob[];
}

export type OllamaClientErrorCode =
  | "cancelled"
  | "http"
  | "invalid_request"
  | "network"
  | "protocol"
  | "response_too_large"
  | "timeout";

export interface OllamaHealthError {
  code: OllamaClientErrorCode | "unknown";
  message: string;
  httpStatus?: number;
}

export interface OllamaHealthCheck {
  ok: boolean;
  error?: OllamaHealthError;
}

export type OllamaHealthStatus =
  | "healthy"
  | "missing-or-stopped"
  | "unhealthy";

export interface OllamaHealthResponse {
  status: OllamaHealthStatus;
  checkedAt: string;
  checks: {
    version: OllamaHealthCheck;
    installedModels: OllamaHealthCheck;
    runningModels: OllamaHealthCheck;
  };
  version?: OllamaVersionResponse;
  installedModels?: OllamaListModelsResponse;
  runningModels?: OllamaListRunningModelsResponse;
}
