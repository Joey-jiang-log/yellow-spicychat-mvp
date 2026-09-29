import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let apiProcess;
let apiBase;
let tempDir;
let upstream;

afterEach(async () => {
  if (apiProcess && apiProcess.exitCode === null && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await new Promise((resolve) => apiProcess.once("exit", resolve));
  }
  apiProcess = undefined;
  apiBase = undefined;
  if (upstream) {
    upstream.closeAllConnections?.();
    await new Promise((resolve) => upstream.close(resolve));
  }
  upstream = undefined;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startApi(upstreamPort, { production = false } = {}) {
  const apiPort = await unusedPort();
  const upstreamBase = `http://127.0.0.1:${upstreamPort}`;
  tempDir = await mkdtemp(join(tmpdir(), "lureva-chat-stream-"));
  apiProcess = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: production ? "production" : "test", YELLOW_TEST_ALLOW_USER_ID: production ? "0" : "1", YELLOW_SESSION_SECRET: production ? "integration-session-secret-at-least-32-bytes" : "", YELLOW_API_PORT: String(apiPort), YELLOW_API_HOST: "127.0.0.1", YELLOW_DATA_FILE: join(tempDir, "yellow.json"), DEEPSEEK_API_KEY: "test-key", DEEPSEEK_BASE_URL: upstreamBase },
    stdio: "ignore",
  });
  apiBase = `http://127.0.0.1:${apiPort}`;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (apiProcess.exitCode !== null) throw new Error("Test API exited before becoming ready");
    try { if ((await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(200) })).ok) return; }
    catch { /* The child has not bound its port yet. */ }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error("Test API did not become ready");
}

const requestBody = (requestId) => ({ userId: "stream-test", characterId: "luna", message: "Hello there.", conversationId: "stream-conversation", requestId });
const parseFrames = (text) => text.split(/\r?\n\r?\n/u).filter(Boolean).map((frame) => JSON.parse(frame.split(/\r?\n/u).find((line) => line.startsWith("data:"))?.slice(5) || "{}"));

describe("server chat streaming", () => {
  it("streams model deltas and replays the same request without a duplicate model call", async () => {
    let upstreamCalls = 0;
    upstream = createHttpServer(async (req, res) => {
      upstreamCalls += 1;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      expect(JSON.parse(Buffer.concat(chunks).toString()).stream).toBe(true);
      res.writeHead(200, { "content-type": "text/event-stream" });
      const pieces = upstreamCalls === 1 ? ["Hello ", "there."] : ["A new ", "direction."];
      for (const piece of pieces) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
    const upstreamPort = await unusedPort();
    await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));
    await startApi(upstreamPort);

    const first = await fetch(`${apiBase}/api/chat/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody("send-1")) });
    expect(first.headers.get("content-type")).toContain("text/event-stream");
    const frames = parseFrames(await first.text());
    expect(frames.filter((frame) => frame.type === "delta").map((frame) => frame.text)).toEqual(["Hello ", "there."]);
    expect(frames.at(-1)).toMatchObject({ type: "complete", result: { message: "Hello there." } });

    const replay = await fetch(`${apiBase}/api/chat/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody("send-1")) });
    const replayFrames = parseFrames(await replay.text());
    expect(replayFrames.at(-1)).toMatchObject({ type: "complete", result: { message: "Hello there." } });
    expect(upstreamCalls).toBe(1);

    const regenerateBody = { userId: "stream-test", characterId: "luna", conversationId: "stream-conversation", requestId: "regen-1" };
    const regenerated = await fetch(`${apiBase}/api/chat/regenerate/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(regenerateBody) }).then((response) => response.text());
    expect(parseFrames(regenerated).at(-1)).toMatchObject({ type: "complete", result: { message: "A new direction." } });
    const regenerateReplay = await fetch(`${apiBase}/api/chat/regenerate/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(regenerateBody) }).then((response) => response.text());
    expect(parseFrames(regenerateReplay).at(-1)).toMatchObject({ type: "complete", result: { message: "A new direction." } });
    expect(upstreamCalls).toBe(2);
    const saved = await fetch(`${apiBase}/api/conversations?userId=stream-test`).then((response) => response.json());
    expect(saved[0].messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(saved[0].messages[1].content).toBe("A new direction.");
  }, 10_000);

  it("scopes conversations to signed browser sessions and feeds committed memory back to the model", async () => {
    const modelRequests = [];
    upstream = createHttpServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      modelRequests.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.end('data: {"choices":[{"delta":{"content":"I will remember that."}}]}\n\ndata: [DONE]\n\n');
    });
    const upstreamPort = await unusedPort();
    await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));
    await startApi(upstreamPort, { production: true });

    const openSession = async () => {
      const response = await fetch(`${apiBase}/api/session`);
      expect(response.status).toBe(200);
      const cookie = response.headers.get("set-cookie").split(";")[0];
      return { cookie, session: await response.json() };
    };
    const alice = await openSession();
    const bob = await openSession();
    expect(alice.session.id).not.toBe(bob.session.id);

    const send = (cookie, message, conversationId, requestId) => fetch(`${apiBase}/api/chat/stream`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ userId: "forged-shared-demo-user", characterId: "luna", message, conversationId, requestId }),
    });
    const first = parseFrames(await (await send(alice.cookie, "Call me Rowan", undefined, "alice-1")).text()).at(-1).result;
    await send(alice.cookie, "I like quiet evenings", first.conversationId, "alice-2");
    expect(modelRequests[1].messages.some((message) => message.content.includes("Persistent memory") && message.content.includes("Preferred name: Rowan"))).toBe(true);

    const bobList = await fetch(`${apiBase}/api/conversations?userId=${encodeURIComponent(alice.session.id)}`, { headers: { cookie: bob.cookie } });
    expect(bobList.status).toBe(200);
    expect(await bobList.json()).toEqual([]);
    const aliceList = await fetch(`${apiBase}/api/conversations?userId=${encodeURIComponent(bob.session.id)}`, { headers: { cookie: alice.cookie } });
    const aliceConversations = await aliceList.json();
    expect(aliceConversations).toHaveLength(1);
    expect(aliceConversations[0].id).toBe(first.conversationId);
    expect(aliceConversations[0].userId).toBe(alice.session.id);

    const noCookie = await fetch(`${apiBase}/api/conversations?userId=${encodeURIComponent(alice.session.id)}`);
    expect(noCookie.status).toBe(401);
    const replaySession = await fetch(`${apiBase}/api/session`, { headers: { cookie: alice.cookie } }).then((response) => response.json());
    expect(replaySession.id).toBe(alice.session.id);
  }, 10_000);

  it("cancels upstream generation and does not save a partial turn", async () => {
    let upstreamClosedResolve;
    const upstreamClosed = new Promise((resolve) => { upstreamClosedResolve = resolve; });
    upstream = createHttpServer(async (req, res) => {
      for await (const _chunk of req) { /* Wait for the request body before starting the simulated reply. */ }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n');
      res.on("close", upstreamClosedResolve);
    });
    const upstreamPort = await unusedPort();
    await new Promise((resolve) => upstream.listen(upstreamPort, "127.0.0.1", resolve));
    await startApi(upstreamPort);

    const controller = new AbortController();
    const response = await fetch(`${apiBase}/api/chat/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody("send-cancel")), signal: controller.signal });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDelta = false;
    while (!sawDelta) {
      const next = await reader.read();
      buffer += decoder.decode(next.value, { stream: !next.done });
      const frames = buffer.split(/\r?\n\r?\n/u);
      buffer = frames.pop() ?? "";
      sawDelta = frames.some((frame) => frame.includes('"type":"delta"'));
      if (next.done) break;
    }
    expect(sawDelta).toBe(true);
    controller.abort();
    await Promise.race([upstreamClosed, new Promise((_, reject) => setTimeout(() => reject(new Error("Upstream request was not canceled")), 2000))]);
    const saved = await fetch(`${apiBase}/api/conversations?userId=stream-test`).then((res) => res.json());
    expect(saved).toEqual([]);
  }, 10_000);
});
