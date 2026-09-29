import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let apiProcess;
let apiDir;
let mockServer;

afterEach(async () => {
  if (apiProcess && apiProcess.exitCode === null && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await new Promise((resolve) => apiProcess.once("exit", resolve));
  }
  apiProcess = undefined;
  if (mockServer?.listening) await new Promise((resolve) => mockServer.close(resolve));
  mockServer = undefined;
  if (apiDir) await rm(apiDir, { recursive: true, force: true });
  apiDir = undefined;
});

async function unusedPort() {
  const server = createNetServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe("chat image unlock integration", () => {
  it("serves configured Sashimi images only after turn, cooldown and conversation limits", async () => {
    const providerRequests = [];
    mockServer = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      providerRequests.push(request);
      const content = "那我们找个咖啡馆，我把刚买的拿铁递给你。";
      if (request.stream) {
        res.writeHead(200, { "content-type": "text/event-stream" });
        for (const text of ["那我们找个", "咖啡馆，", "我把刚买的拿铁递给你。"])
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
        res.end("data: [DONE]\n\n");
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ model: "mock-model", choices: [{ message: { content } }] }));
    });
    await new Promise((resolve, reject) => mockServer.once("error", reject).listen(0, "127.0.0.1", resolve));
    const mockAddress = mockServer.address();
    if (!mockAddress || typeof mockAddress === "string") throw new Error("Could not start mock model provider");

    const port = await unusedPort();
    apiDir = await mkdtemp(join(tmpdir(), "yellow-image-unlock-"));
    apiProcess = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        YELLOW_TEST_ALLOW_USER_ID: "1",
        YELLOW_API_PORT: String(port),
        YELLOW_API_HOST: "127.0.0.1",
        YELLOW_DATA_FILE: join(apiDir, "yellow.json"),
        YELLOW_ADMIN_TOKEN: "image-unlock-test-token",
        DEEPSEEK_API_KEY: "test-key",
        DEEPSEEK_BASE_URL: `http://127.0.0.1:${mockAddress.port}`,
      },
      stdio: "ignore",
    });

    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (apiProcess.exitCode !== null) throw new Error("Test API exited before becoming ready");
      try {
        const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(200) });
        if (response.ok) { ready = true; break; }
      } catch { /* The child has not bound its port yet. */ }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    expect(ready).toBe(true);

    const adminHeaders = { "content-type": "application/json", "x-admin-token": "image-unlock-test-token" };
    const editResponse = await fetch(`${base}/api/admin/characters/sashimi`, { method: "PATCH", headers: adminHeaders, body: JSON.stringify({ imageUnlockMinTurns: 2, imageUnlockCooldownTurns: 3, imageUnlockMaxImagesPerConversation: 2 }) });
    expect(editResponse.status).toBe(200);

    const chat = async (message, conversationId, sceneId) => {
      const response = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "image-test-user", characterId: "sashimi", message, conversationId, sceneId }) });
      expect(response.status).toBe(200);
      return response.json();
    };
    const first = await chat("你好，今天怎么样？");
    expect(first.image).toBeNull();
    expect(first.debug.imageUnlock.reason).toBe("locked_until_min_turns");

    const second = await chat("我们去电影院看电影吧", first.conversationId);
    expect(second.image?.id).toBe("sashimi-cinema");
    expect(second.image.imageUrl).toBe("/characters/optimized/sashimi-cinema-640-v1.jpg");
    expect(providerRequests[0].messages.some((message) => message.content.includes("curated fictional scene card"))).toBe(false);
    expect(providerRequests[1].messages.some((message) => message.content.includes("影院 · 爆米花约会"))).toBe(true);

    const third = await chat("这部片的预告看起来不错", first.conversationId);
    expect(third.image).toBeNull();
    expect(third.debug.imageUnlock.reason).toBe("cooldown");
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("Scene card shown: 影院 · 爆米花约会"))).toBe(true);

    const debugHeaders = { "content-type": "application/json", "x-admin-token": "image-unlock-test-token" };
    const debugFirst = await fetch(`${base}/api/admin/debug/chat`, { method: "POST", headers: debugHeaders, body: JSON.stringify({ userId: "debug-memory-user", characterId: "sashimi", message: "我今天想喝咖啡", environment: "debug" }) });
    expect(debugFirst.status).toBe(200);
    const debugFirstResult = await debugFirst.json();
    expect(debugFirstResult.debug.memory).toContain("萨西米");
    expect(debugFirstResult.debug.memory).toContain("You: 我今天想喝咖啡");
    const debugSecond = await fetch(`${base}/api/admin/debug/chat`, { method: "POST", headers: debugHeaders, body: JSON.stringify({ userId: "debug-memory-user", characterId: "sashimi", conversationId: debugFirstResult.conversationId, message: "我喜欢燕麦拿铁", environment: "debug" }) });
    const debugSecondResult = await debugSecond.json();
    expect(debugSecondResult.debug.memory).toContain("You: 我今天想喝咖啡");
    expect(debugSecondResult.debug.memory).toContain("You: 我喜欢燕麦拿铁");

    await chat("我最近想读一本新书", first.conversationId);
    const fifth = await chat("我们去书店一起读书吗", first.conversationId);
    expect(fifth.image?.id).toBe("sashimi-bookstore");

    const sixth = await chat("喝咖啡吧", first.conversationId);
    expect(sixth.image).toBeNull();
    expect(sixth.debug.imageUnlock.reason).toBe("conversation_limit_reached");

    const historyResponse = await fetch(`${base}/api/conversations/${first.conversationId}?userId=image-test-user`);
    const history = await historyResponse.json();
    expect(history.messages.filter((message) => message.imageId).map((message) => message.imageTitle)).toEqual(["影院 · 爆米花约会", "书店 · 一起读书"]);
    expect(history.messages.filter((message) => message.imageId).every((message) => message.imageUrl.startsWith("/characters/optimized/"))).toBe(true);

    const selectedSceneFirst = await chat("先不急着决定，想听听你今天过得怎么样。", "selected-scene-chat", "cafe");
    expect(selectedSceneFirst.image).toBeNull();
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("咖啡馆 · 拿铁时光"))).toBe(true);
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("No scene image is attached"))).toBe(true);
    const selectedSceneSecond = await chat("我们找个地方坐坐吧。", "selected-scene-chat", "bookstore");
    expect(selectedSceneSecond.image?.id).toBe("sashimi-bookstore");
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("书店 · 一起读书"))).toBe(true);
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("A curated scene image will accompany"))).toBe(true);
    const selectedSceneHistory = await fetch(`${base}/api/conversations/${selectedSceneFirst.conversationId}?userId=image-test-user`).then((response) => response.json());
    expect(selectedSceneHistory.messages.find((message) => message.role === "user")?.sceneId).toBe("cafe");
    const regenerated = await fetch(`${base}/api/chat/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "image-test-user", characterId: "sashimi", conversationId: selectedSceneFirst.conversationId }) }).then((response) => response.json());
    expect(regenerated.image).toBeNull();
    expect(providerRequests.at(-1).messages.some((message) => message.content.includes("书店 · 一起读书"))).toBe(true);

    const streamResponse = await fetch(`${base}/api/chat/stream`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: "stream-test-user", characterId: "sashimi", message: "你好", requestId: "stream-request-1" }) });
    expect(streamResponse.status).toBe(200);
    const events = (await streamResponse.text()).split(/\r?\n\r?\n/u).filter(Boolean).map((frame) => JSON.parse(frame.replace(/^data:\s*/u, "")));
    expect(events.filter((event) => event.type === "delta").map((event) => event.text).join("")).toBe("那我们找个咖啡馆，我把刚买的拿铁递给你。");
    expect(events.at(-1).type).toBe("complete");
    expect(events.at(-1).result.debug.imageUnlock.reason).toBe("locked_until_min_turns");
  }, 15_000);
});
