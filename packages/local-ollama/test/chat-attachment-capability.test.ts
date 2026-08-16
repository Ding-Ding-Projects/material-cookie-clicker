/**
 * Attachments are gated on a capability the selected model actually reports.
 * The gate lives in the chat manager, so a host cannot bypass it by enabling
 * its own file input.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { LocalChatManager, type ChatAttachment } from "../src/chat.ts";
import { LocalOllamaSuiteController } from "../src/controller.ts";
import { FakeBridge, MemoryChatHistoryStore, makeControllerOptions, makeModel } from "./fakes.ts";

const IMAGE: ChatAttachment = { name: "diagram.png", kind: "image", base64: "aGVsbG8=" };

async function drain(stream: AsyncIterable<{ content: string }>): Promise<string> {
  let text = "";
  for await (const chunk of stream) text += chunk.content;
  return text;
}

test("a session without the image capability rejects an attachment and never calls the model", async () => {
  const store = new MemoryChatHistoryStore();
  const gateway = new FakeBridge();
  const manager = new LocalChatManager(store, gateway);
  const session = await manager.createSession({
    title: "Local model chat",
    model: "text-only:7b",
    capabilities: ["tools"],
  });

  await assert.rejects(
    drain(manager.send(session.id, { content: "Describe this", attachments: [IMAGE], containsTaxData: false })),
    /does not report image capability/,
  );
  assert.equal(gateway.chatCalls, 0, "a rejected attachment must not reach the local model");
});

test("a session that reports the image capability accepts the same attachment", async () => {
  const store = new MemoryChatHistoryStore();
  const gateway = new FakeBridge();
  const manager = new LocalChatManager(store, gateway);
  const session = await manager.createSession({
    title: "Local model chat",
    model: "vision:7b",
    capabilities: ["vision"],
  });

  const text = await drain(
    manager.send(session.id, { content: "Describe this", attachments: [IMAGE], containsTaxData: false }),
  );

  assert.equal(text, "local reply");
  assert.equal(gateway.chatCalls, 1);
  assert.deepEqual(store.sessions.get(session.id)?.messages[0]?.attachmentNames, ["diagram.png"]);
});

test("the suite state reports whether the selected model accepts attachments", async () => {
  const harness = makeControllerOptions({
    bridge: { installed: [makeModel("text-only:7b", ["tools"]), makeModel("vision:7b", ["vision"])] },
  });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();

    controller.selectChatModel("text-only:7b");
    let state = controller.snapshot();
    assert.equal(state.chat.attachmentsSupported, false);
    assert.match(state.chat.attachmentSupportReason, /does not report the image capability/);

    controller.selectChatModel("vision:7b");
    state = controller.snapshot();
    assert.equal(state.chat.attachmentsSupported, true);
    assert.match(state.chat.attachmentSupportReason, /reports the image capability/);
  } finally {
    controller.dispose();
  }
});

test("a rejected attachment surfaces on the chat attachment error, not only the general error", async () => {
  const harness = makeControllerOptions({ bridge: { installed: [makeModel("text-only:7b", ["tools"])] } });
  const controller = new LocalOllamaSuiteController(harness.options);
  try {
    await controller.refreshRuntime();
    await controller.sendChat({
      model: "text-only:7b",
      systemPrompt: "",
      content: "Describe this",
      attachments: [IMAGE],
      containsTaxData: false,
      reviewedTaxData: false,
    });

    const state = controller.snapshot();
    assert.match(state.chat.attachmentError ?? "", /does not report image capability/);
    assert.equal(state.chat.attachmentError, state.chat.error);
    assert.equal(harness.bridge.chatCalls, 0);
    assert.deepEqual(state.chat.transcript, []);
  } finally {
    controller.dispose();
  }
});

test("a message marked as containing tax data is refused until it is reviewed", async () => {
  const store = new MemoryChatHistoryStore();
  const gateway = new FakeBridge();
  const manager = new LocalChatManager(store, gateway);
  const session = await manager.createSession({
    title: "Local model chat",
    model: "text-only:7b",
    capabilities: [],
  });

  await assert.rejects(
    drain(manager.send(session.id, { content: "A figure from a return", containsTaxData: true })),
    /Review the exact tax data/,
  );
  assert.equal(gateway.chatCalls, 0);
});
