import { describe, expect, it } from "vitest";
import { characterCardImageSrcSet, isLiveChatConfigured, optimizeBundledCharacterImage, toFrontendCharacter } from "../src/api";

describe("chat provider readiness", () => {
  it("only enables model requests for a configured live provider", () => {
    expect(isLiveChatConfigured({ ok: true, service: "api", provider: "deepseek", model: "chat", configured: true })).toBe(true);
    expect(isLiveChatConfigured({ ok: true, service: "api", provider: "mock", model: "mock", configured: true })).toBe(false);
    expect(isLiveChatConfigured({ ok: true, service: "api", provider: "deepseek", model: "chat", configured: false })).toBe(false);
    expect(isLiveChatConfigured({ ok: false, service: "api", provider: "deepseek", model: "chat", configured: true })).toBe(false);
  });
});

describe("optimized built-in character images", () => {
  it("maps built-in PNG URLs to the versioned lightweight asset", () => {
    expect(optimizeBundledCharacterImage("/characters/luna.png")).toBe("/characters/optimized/luna-900-v1.jpg");
  });

  it("preserves user-uploaded and external image URLs", () => {
    expect(optimizeBundledCharacterImage("/uploads/custom-character.png")).toBe("/uploads/custom-character.png");
    expect(optimizeBundledCharacterImage("https://images.example.test/custom.png")).toBe("https://images.example.test/custom.png");
  });

  it("only maps the known public test-catalog portraits to deployed optimized assets", () => {
    expect(optimizeBundledCharacterImage("/uploads/seed-hazel-smith.png")).toBe("/characters/optimized/hazel-smith-900-v1.jpg");
    expect(optimizeBundledCharacterImage("/uploads/sashimi-cafe.png")).toBe("/characters/optimized/sashimi-900-v1.jpg");
    expect(optimizeBundledCharacterImage("/uploads/private-test.png")).toBe("/uploads/private-test.png");
  });

  it("uses optimized URLs for API-provided built-in images", () => {
    const character = toFrontendCharacter({ id: "luna", name: "Luna", tags: [], greeting: "Hi", image: "/characters/luna.png" });
    expect(character.image).toBe("/characters/optimized/luna-900-v1.jpg");
    expect(character.coverImage).toBe("/characters/optimized/luna-900-v1.jpg");
  });

  it("offers a lighter responsive image to discovery cards while preserving the detail-size source", () => {
    expect(characterCardImageSrcSet("/characters/optimized/luna-900-v1.jpg")).toBe("/characters/optimized/luna-640-v2.jpg 640w");
    expect(characterCardImageSrcSet("/uploads/custom-character.png")).toBeUndefined();
  });

  it("preserves Sashimi's curated scene starters when public character data hydrates", () => {
    const sashimi = toFrontendCharacter({ id: "sashimi", name: "萨西米", tags: [], greeting: "你好" });
    expect(sashimi.sceneStarters?.map((scene) => scene.id)).toEqual(["cafe", "bookstore", "study", "cozy_home", "cinema"]);
    expect(sashimi.sceneStarters?.every((scene) => scene.imageUrl.startsWith("/characters/optimized/sashimi-") && scene.imageUrl.endsWith("-640-v1.jpg"))).toBe(true);
  });

  it("passes homepage sections and placement order through to the discovery UI", () => {
    const character = toFrontendCharacter({
      id: "sashimi", name: "萨西米", tags: ["Cozy"], greeting: "你好",
      homepagePlacements: [{ section: "Book Club", position: 2, enabled: true }],
    });
    expect(character.homepagePlacements).toEqual([{ section: "Book Club", position: 2, enabled: true }]);
  });
});
