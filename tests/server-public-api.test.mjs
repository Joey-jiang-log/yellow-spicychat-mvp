import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

let apiProcess;
let tempDir;

afterEach(async () => {
  if (apiProcess && apiProcess.exitCode === null && !apiProcess.killed) {
    apiProcess.kill("SIGTERM");
    await new Promise((resolve) => apiProcess.once("exit", resolve));
  }
  apiProcess = undefined;
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not allocate a test port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

describe("public character API boundary", () => {
  it("keeps unpublished characters and internal prompt fields out of public responses", async () => {
    const port = await unusedPort();
    tempDir = await mkdtemp(join(tmpdir(), "yellow-api-test-"));
    apiProcess = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        YELLOW_TEST_ALLOW_USER_ID: "1",
        YELLOW_API_PORT: String(port),
        YELLOW_API_HOST: "127.0.0.1",
        YELLOW_DATA_FILE: join(tempDir, "yellow.json"),
        YELLOW_ADMIN_TOKEN: "integration-test-token",
        DEEPSEEK_API_KEY: "",
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

    const createDraft = await fetch(`${base}/api/admin/characters`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "integration-test-token" },
      body: JSON.stringify({ id: "private-draft-check", name: "Private draft check", status: "draft", persona: "SECRET_PERSONA_TEST_SENTINEL" }),
    });
    expect(createDraft.status).toBe(201);

    const adminHeaders = { "content-type": "application/json", "x-admin-token": "integration-test-token" };
    const createImage = await fetch(`${base}/api/admin/characters/private-draft-check/images`, {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ title: "Cafe", tags: ["cafe"], triggerType: "ai_intent", triggerCondition: { intent: "cafe" }, dataUrl: "data:image/png;base64,aGVsbG8=" }),
    });
    expect(createImage.status).toBe(201);
    const initialImage = await createImage.json();
    const replaceImage = await fetch(`${base}/api/admin/character-images/${initialImage.id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ title: "Coffee date", tags: ["date", "cafe"], enabled: false, dataUrl: "data:image/jpeg;base64,d29ybGQ=" }),
    });
    expect(replaceImage.status).toBe(200);
    const replacedImage = await replaceImage.json();
    expect(replacedImage.title).toBe("Coffee date");
    expect(replacedImage.tags).toEqual(["date", "cafe"]);
    expect(replacedImage.enabled).toBe(false);
    expect(replacedImage.imageUrl).not.toBe(initialImage.imageUrl);
    expect(replacedImage.imageUrl).toMatch(/^\/uploads\/image_/);

    const rejectImage = await fetch(`${base}/api/admin/character-images/${initialImage.id}`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }),
    });
    expect(rejectImage.status).toBe(400);

    const placementUpdate = await fetch(`${base}/api/admin/homepage`, {
      method: "PATCH",
      headers: adminHeaders,
      body: JSON.stringify({ placements: [
        { id: "book-club-sashimi", characterId: "sashimi", section: "Book Club", position: 1, enabled: true },
        { id: "book-club-luna", characterId: "luna", section: "Book Club", position: 2, enabled: true },
        { id: "featured-sashimi", characterId: "sashimi", section: "Featured", position: 4, enabled: true },
      ] }),
    });
    expect(placementUpdate.status).toBe(200);
    const savedPlacements = await placementUpdate.json();
    expect(savedPlacements.filter((placement) => placement.section === "Book Club").map((placement) => placement.position)).toEqual([1, 2]);

    const listResponse = await fetch(`${base}/api/characters?status=all`);
    expect(listResponse.status).toBe(200);
    const characters = await listResponse.json();
    expect(characters.every((character) => character.status === "online")).toBe(true);
    expect(characters[0].id).toBe("sashimi");
    expect(characters.some((character) => character.id === "private-draft-check")).toBe(false);
    expect(JSON.stringify(characters)).not.toContain("SECRET_PERSONA_TEST_SENTINEL");
    expect(characters[0]).not.toHaveProperty("persona");
    expect(characters[0]).not.toHaveProperty("characterPrompt");
    expect(characters.find((character) => character.id === "sashimi")?.homepagePlacements).toContainEqual({ section: "Book Club", position: 1, enabled: true });

    const draftResponse = await fetch(`${base}/api/characters/private-draft-check`);
    expect(draftResponse.status).toBe(404);
  }, 10_000);
});
