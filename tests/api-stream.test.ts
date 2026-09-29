import { describe, expect, it } from "vitest";
import { readChatEventStream, type ChatResponse } from "../src/api";

function eventResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const completeResult = { conversationId: "conversation-1", message: "Hello there!", image: null, debug: { model: "test", provider: "test", imageIntent: null, matchedImage: null, imageUnlock: null, memory: "New conversation", contextTokens: 3, latencyMs: 1 } } satisfies ChatResponse;

describe("chat event stream reader", () => {
  it("handles event boundaries split between network chunks and returns the saved response", async () => {
    const chunks = [
      'data: {"type":"delta","text":"Hello "}\n\n',
      'data: {"type":"delta","text":"there!"}\n\ndata: {"type":"complete","result":',
      `${JSON.stringify(completeResult)}}\n\n`,
    ];
    const deltas: string[] = [];
    const result = await readChatEventStream(eventResponse(chunks), (delta) => deltas.push(delta));
    expect(deltas).toEqual(["Hello ", "there!"]);
    expect(result).toEqual(completeResult);
  });

  it("surfaces a server stream error instead of silently accepting a partial reply", async () => {
    await expect(readChatEventStream(eventResponse(['data: {"type":"error","message":"Try again"}\n\n']), () => {})).rejects.toThrow("Try again");
  });
});
