import { describe, expect, it } from "vitest";
import { detectImageIntent, selectTriggeredImage } from "../server/image-triggers.mjs";

const character = { id: "sashimi", imageUnlockEnabled: true, imageUnlockMinTurns: 2, imageUnlockCooldownTurns: 3, imageUnlockMaxImagesPerConversation: 2 };
const images = [
  { id: "cafe", characterId: "sashimi", title: "Cafe", tags: ["cafe"], triggerType: "ai_intent", triggerCondition: { intent: "cafe" }, priority: 50, cooldownMessages: 3, enabled: true },
  { id: "cinema", characterId: "sashimi", title: "Cinema", tags: ["cinema"], triggerType: "ai_intent", triggerCondition: { intent: "cinema" }, priority: 50, cooldownMessages: 3, enabled: true },
  { id: "promo", characterId: "sashimi", title: "Promo", tags: ["promo"], triggerType: "ai_intent", triggerCondition: { intent: "cinema" }, priority: 100, cooldownMessages: 0, enabled: false },
];
const conversationAt = (turns: Array<{ text: string; imageId?: string }>) => ({ messages: turns.flatMap(({ text, imageId }) => [{ role: "user", content: text }, { role: "assistant", content: "Reply", imageId: imageId || null }]) });

describe("character image unlock rules", () => {
  it("detects supported scenes in Chinese and English", () => {
    expect(detectImageIntent("今天去电影院看电影吧，买点爆米花")).toBe("cinema");
    expect(detectImageIntent("Let's get a latte at the cafe")).toBe("cafe");
  });

  it("holds images until the configured user turn, then matches a scene", () => {
    const locked = selectTriggeredImage({ images, character, conversation: { messages: [] }, userText: "咖啡", explicitIntent: "cafe" });
    expect(locked.image).toBeNull();
    expect(locked.unlock.reason).toBe("locked_until_min_turns");
    expect(locked.unlock.remainingTurns).toBe(1);

    const unlocked = selectTriggeredImage({ images, character, conversation: conversationAt([{ text: "你好" }]), userText: "一起喝杯咖啡吗？", explicitIntent: null });
    expect(unlocked.image?.id).toBe("cafe");
    expect(unlocked.unlock.reason).toBe("image_matched");
  });

  it("enforces global cooldown, excludes disabled assets, and caps a conversation", () => {
    const cooldown = selectTriggeredImage({ images, character, conversation: conversationAt([{ text: "咖啡", imageId: "cafe" }, { text: "之后" }]), userText: "去电影院吧", explicitIntent: null });
    expect(cooldown.image).toBeNull();
    expect(cooldown.unlock.reason).toBe("cooldown");

    const nextEligible = selectTriggeredImage({ images, character, conversation: conversationAt([{ text: "咖啡", imageId: "cafe" }, { text: "之后" }, { text: "之后" }, { text: "之后" }]), userText: "去电影院吧", explicitIntent: null });
    expect(nextEligible.image?.id).toBe("cinema");

    const capped = selectTriggeredImage({ images, character, conversation: conversationAt([{ text: "咖啡", imageId: "cafe" }, { text: "之后" }, { text: "之后" }, { text: "电影", imageId: "cinema" }]), userText: "看书", explicitIntent: null });
    expect(capped.image).toBeNull();
    expect(capped.unlock.reason).toBe("conversation_limit_reached");
  });

  it("never repeats a scene card in one conversation and does not let the model force an unrelated image", () => {
    const sameSceneAgain = selectTriggeredImage({ images, character, conversation: conversationAt([
      { text: "咖啡", imageId: "cafe" },
      { text: "聊聊别的" },
      { text: "今天有点忙" },
      { text: "改天再说" },
    ]), userText: "再喝杯咖啡吧", explicitIntent: null });
    expect(sameSceneAgain.image).toBeNull();
    expect(sameSceneAgain.unlock.reason).toBe("no_scene_match");

    const modelOnlyScene = selectTriggeredImage({ images, character, conversation: conversationAt([{ text: "你好" }]), userText: "今天有点累", explicitIntent: null });
    expect(modelOnlyScene.image).toBeNull();
    expect(modelOnlyScene.unlock.reason).toBe("no_scene_match");
  });

  it("supports the exact round-window and keyword condition shapes configured in admin", () => {
    const scheduled = { id: "scheduled", characterId: "sashimi", title: "Scheduled", tags: [], triggerType: "round" as const, triggerCondition: { fromTurn: 3, toTurn: 5 }, priority: 40, cooldownMessages: 0, enabled: true };
    const roundMatch = selectTriggeredImage({ images: [scheduled], character, conversation: conversationAt([{ text: "one" }, { text: "two" }]), userText: "hello", explicitIntent: null });
    expect(roundMatch.image?.id).toBe("scheduled");
    expect(roundMatch.unlock.reason).toBe("image_matched");

    const keyword = { id: "keyword", characterId: "sashimi", title: "Selfie", tags: [], triggerType: "keyword" as const, triggerCondition: { keywords: ["selfie", "photo"] }, priority: 40, cooldownMessages: 0, enabled: true };
    const keywordMatch = selectTriggeredImage({ images: [keyword], character, conversation: conversationAt([{ text: "hello" }]), userText: "Can you send a selfie?", explicitIntent: null });
    expect(keywordMatch.image?.id).toBe("keyword");
  });
});
