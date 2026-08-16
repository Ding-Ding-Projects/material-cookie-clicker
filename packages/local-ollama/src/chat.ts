export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface LocalChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  attachmentNames: string[];
  taxDataReviewed: boolean;
}

export interface LocalChatSession {
  id: string;
  title: string;
  model: string;
  systemPrompt: string;
  options: Record<string, string | number | boolean>;
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
  messages: LocalChatMessage[];
}

export interface ChatAttachment {
  name: string;
  kind: "image";
  base64: string;
}

export interface ChatSubmission {
  content: string;
  attachments?: ChatAttachment[];
  containsTaxData: boolean;
  reviewedTaxDataAt?: string;
}

export interface ChatStreamChunk {
  content: string;
  thinking?: string;
  done: boolean;
  doneReason?: string;
}

export interface LocalChatGateway {
  chatStream(
    request: {
      model: string;
      messages: Array<{ role: ChatRole; content: string; images?: string[] }>;
      options: Record<string, string | number | boolean>;
    },
    signal: AbortSignal,
  ): AsyncIterable<ChatStreamChunk>;
}

export interface ChatHistoryStore {
  create(session: LocalChatSession): Promise<void>;
  read(id: string): Promise<LocalChatSession | null>;
  update(session: LocalChatSession): Promise<void>;
  list(afterId: string | null, limit: number): Promise<LocalChatSession[]>;
  delete(id: string): Promise<void>;
}

export interface ChatLimits {
  maxSessions: number;
  maxMessagesPerSession: number;
  maxMessageCharacters: number;
  maxSystemPromptCharacters: number;
  maxAttachmentBytes: number;
}

export const DEFAULT_CHAT_LIMITS: ChatLimits = {
  maxSessions: 100,
  maxMessagesPerSession: 500,
  maxMessageCharacters: 64_000,
  maxSystemPromptCharacters: 16_000,
  maxAttachmentBytes: 10 * 1024 * 1024,
};

export class LocalChatManager {
  readonly #store: ChatHistoryStore;
  readonly #gateway: LocalChatGateway;
  readonly #limits: ChatLimits;
  readonly #now: () => Date;
  readonly #id: () => string;
  readonly #active = new Map<string, AbortController>();

  constructor(
    store: ChatHistoryStore,
    gateway: LocalChatGateway,
    options: { limits?: Partial<ChatLimits>; now?: () => Date; id?: () => string } = {},
  ) {
    this.#store = store;
    this.#gateway = gateway;
    this.#limits = { ...DEFAULT_CHAT_LIMITS, ...options.limits };
    this.#now = options.now ?? (() => new Date());
    this.#id = options.id ?? (() => globalThis.crypto.randomUUID());
  }

  async createSession(input: {
    title: string;
    model: string;
    systemPrompt?: string;
    options?: Record<string, string | number | boolean>;
    capabilities: string[];
  }): Promise<LocalChatSession> {
    const existing = await this.#store.list(null, this.#limits.maxSessions + 1);
    if (existing.length >= this.#limits.maxSessions) throw new Error("The local chat-session limit has been reached.");
    const systemPrompt = input.systemPrompt ?? "";
    if (systemPrompt.length > this.#limits.maxSystemPromptCharacters) throw new Error("The system prompt is too long.");
    if (!input.model.trim()) throw new Error("Choose an installed model before creating a chat.");
    const now = this.#now().toISOString();
    const session: LocalChatSession = {
      id: this.#id(),
      title: input.title.trim() || "Untitled local chat",
      model: input.model,
      systemPrompt,
      options: input.options ?? {},
      capabilities: [...new Set(input.capabilities)],
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await this.#store.create(session);
    return session;
  }

  stop(sessionId: string): void {
    this.#active.get(sessionId)?.abort("Stopped by user");
  }

  async *send(sessionId: string, submission: ChatSubmission): AsyncIterable<ChatStreamChunk> {
    const session = await this.#store.read(sessionId);
    if (!session) throw new Error("The local chat session no longer exists.");
    if (this.#active.has(sessionId)) throw new Error("This chat already has a response in progress.");
    const content = submission.content.trim();
    if (!content) throw new Error("Enter a message before sending.");
    if (content.length > this.#limits.maxMessageCharacters) throw new Error("The message is too long.");
    if (session.messages.length + 2 > this.#limits.maxMessagesPerSession) throw new Error("This chat reached its message limit.");
    if (submission.containsTaxData && !submission.reviewedTaxDataAt) {
      throw new Error("Review the exact tax data and explicitly acknowledge local model processing before sending.");
    }
    const attachments = submission.attachments ?? [];
    if (attachments.length > 0 && !session.capabilities.includes("vision")) {
      throw new Error("The selected model does not report image capability. Choose a verified vision model.");
    }
    const totalAttachmentBytes = attachments.reduce((total, attachment) => total + Math.ceil(attachment.base64.length * 0.75), 0);
    if (totalAttachmentBytes > this.#limits.maxAttachmentBytes) throw new Error("The selected attachments exceed the local size limit.");
    const now = this.#now().toISOString();
    const userMessage: LocalChatMessage = {
      id: this.#id(),
      role: "user",
      content,
      createdAt: now,
      attachmentNames: attachments.map((attachment) => attachment.name),
      taxDataReviewed: submission.containsTaxData,
    };
    const controller = new AbortController();
    this.#active.set(sessionId, controller);
    let assistantContent = "";
    try {
      const requestMessages: Array<{ role: ChatRole; content: string; images?: string[] }> = [];
      if (session.systemPrompt) requestMessages.push({ role: "system", content: session.systemPrompt });
      requestMessages.push(
        ...session.messages.map((message) => ({ role: message.role, content: message.content })),
        {
          role: "user" as const,
          content,
          ...(attachments.length > 0 ? { images: attachments.map((attachment) => attachment.base64) } : {}),
        },
      );
      for await (const chunk of this.#gateway.chatStream(
        { model: session.model, messages: requestMessages, options: session.options },
        controller.signal,
      )) {
        assistantContent += chunk.content;
        if (assistantContent.length > this.#limits.maxMessageCharacters) {
          controller.abort("Response exceeded the local message limit");
          throw new Error("The local model response exceeded the configured message limit.");
        }
        yield chunk;
      }
      const finishedAt = this.#now().toISOString();
      const assistantMessage: LocalChatMessage = {
        id: this.#id(),
        role: "assistant",
        content: assistantContent,
        createdAt: finishedAt,
        attachmentNames: [],
        taxDataReviewed: false,
      };
      await this.#store.update({
        ...session,
        updatedAt: finishedAt,
        messages: [...session.messages, userMessage, assistantMessage],
      });
    } finally {
      this.#active.delete(sessionId);
    }
  }

  async exportRedacted(sessionId: string): Promise<string> {
    const session = await this.#store.read(sessionId);
    if (!session) throw new Error("The local chat session no longer exists.");
    return JSON.stringify(
      {
        schemaVersion: 1,
        id: session.id,
        title: session.title,
        model: session.model,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages.map(({ id, role, content, createdAt, attachmentNames }) => ({
          id,
          role,
          content,
          createdAt,
          attachmentNames,
        })),
        omissions: ["Model payload internals", "environment values", "local paths", "credentials"],
      },
      null,
      2,
    );
  }
}
