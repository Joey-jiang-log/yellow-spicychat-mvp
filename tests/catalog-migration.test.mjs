import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

describe("legacy catalog and Sashimi scene migration", () => {
  it("adds missing built-ins and scene images without overwriting saved roles or image settings", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "lureva-catalog-migration-"));
    const dataPath = join(tempDir, "yellow.json");
    await writeFile(dataPath, JSON.stringify({
      catalogSeedVersion: 2,
      characters: [
        { id: "sashimi", name: "萨西米", status: "online", persona: "Keep this edited persona." },
        { id: "luna", name: "Luna Vale", status: "offline", persona: "Keep offline status." },
      ],
      images: [{ id: "sashimi-cafe", characterId: "sashimi", title: "My renamed cafe scene", imageUrl: "/uploads/custom-cafe.jpg", enabled: false, triggerType: "ai_intent", triggerCondition: { intent: "cafe" }, tags: ["custom"], priority: 99 }],
      placements: [{ id: "keep-placement", characterId: "sashimi", section: "Featured", position: 9, weight: 80, enabled: true }],
      conversations: [{ id: "keep-conversation", userId: "user-1", characterId: "sashimi", messages: [] }],
    }));

    const port = await unusedPort();
    apiProcess = spawn(process.execPath, ["server/index.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, YELLOW_API_PORT: String(port), YELLOW_API_HOST: "127.0.0.1", YELLOW_DATA_FILE: dataPath, YELLOW_ADMIN_TOKEN: "migration-test-token", DEEPSEEK_API_KEY: "" },
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

    const characters = await fetch(`${base}/api/characters`).then((response) => response.json());
    expect(characters.filter((character) => character.status === "online")).toHaveLength(22);
    expect(characters.some((character) => character.id === "sashimi")).toBe(true);
    expect(characters.some((character) => character.id === "luna")).toBe(false);

    const images = await fetch(`${base}/api/admin/images`, { headers: { "x-admin-token": "migration-test-token" } }).then((response) => response.json());
    expect(images.filter((image) => image.characterId === "sashimi")).toHaveLength(6);
    expect(images.find((image) => image.id === "sashimi-cafe")).toMatchObject({ title: "My renamed cafe scene", enabled: false, tags: ["custom"] });
    expect(images.map((image) => image.id)).toContain("sashimi-bookstore");

    const migrated = JSON.parse(await readFile(dataPath, "utf8"));
    expect(migrated.characters.find((character) => character.id === "sashimi").persona).toBe("Keep this edited persona.");
    expect(migrated.characters.find((character) => character.id === "luna").status).toBe("offline");
    expect(migrated.catalogSeedVersion).toBe(3);
    expect(migrated.conversations).toEqual([{ id: "keep-conversation", userId: "user-1", characterId: "sashimi", messages: [] }]);
    expect(migrated.placements).toContainEqual({ id: "keep-placement", characterId: "sashimi", section: "Featured", position: 9, weight: 80, enabled: true });
  }, 10_000);
});
