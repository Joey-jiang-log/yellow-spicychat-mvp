import { describe, expect, it } from "vitest";
import { applyDemoBillingOutcome, buildReply, commitReply, emptyState, extractMemory, hasCorruptStateBackup, loadState, makeConversation, normalizeState, orderChatSessions, quotaRemaining, recoverInterruptedGeneration, releaseReply, reserveReply, saveState, STORAGE_BACKUP_KEY, STORAGE_KEY, streamText } from "../src/domain";
import { CHARACTERS, getCharacter, getCharacterProfilePhotos } from "../src/data";

function withWindowStorage<T>(entries: Record<string, string>, run: (storage: { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void; removeItem: (key: string) => void }) => T) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const storage = {
    getItem: (key: string) => entries[key] ?? null,
    setItem: (key: string, value: string) => { entries[key] = String(value); },
    removeItem: (key: string) => { delete entries[key]; },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage } });
  try { return run(storage); }
  finally { if (previous) Object.defineProperty(globalThis, "window", previous); else Reflect.deleteProperty(globalThis, "window"); }
}

describe("demo quota authority", () => {
  it("uses one shared free bucket and cannot reserve past the limit", () => {
    const state = emptyState(); state.usageCommitted = 19;
    expect(quotaRemaining(state)).toBe(1); expect(reserveReply(state)).toBe(true); expect(reserveReply(state)).toBe(false);
    commitReply(state); expect(quotaRemaining(state)).toBe(0); expect(reserveReply(state)).toBe(false);
  });
  it("releases a failed reservation without consuming a reply", () => { const state = emptyState(); expect(reserveReply(state)).toBe(true); releaseReply(state); expect(state.usageCommitted).toBe(0); expect(quotaRemaining(state)).toBe(20); });
  it("recovers a refresh during streaming without burning or locking a reply", () => {
    const state = emptyState(); state.usageReserved = 1;
    const conversation = makeConversation("luna");
    conversation.messages = [
      { id: "user-1", role: "user", content: "refresh me", status: "pending", createdAt: 1 },
      { id: "assistant-1", role: "assistant", content: "partial", status: "streaming", createdAt: 2 },
    ];
    state.conversations.luna = conversation;
    recoverInterruptedGeneration(state);
    expect(state.usageReserved).toBe(0);
    expect(state.conversations.luna.messages).toEqual([{ id: "user-1", role: "user", content: "refresh me", status: "failed", createdAt: 1 }]);
    expect(quotaRemaining(state)).toBe(20);
  });
  it("turns malformed persisted data into a renderable state", () => {
    const state = normalizeState({ userId: "demo-user", usageCommitted: "19", favorites: null, drafts: null, conversations: { luna: { characterId: "luna", messages: null, memory: null } }, subscription: { status: "unknown", committed: null } });
    expect(state.userId).toBe("demo-user");
    expect(state.favorites).toEqual([]);
    expect(state.conversations.luna.messages).toEqual([]);
    expect(state.subscription.status).toBe("free");
    expect(quotaRemaining(state)).toBe(20);
  });
  it("keeps a failed regenerate retry marker across normalization", () => {
    const state = normalizeState({ conversations: { luna: { characterId: "luna", pendingRegenerateText: "retry this version", messages: [] } } });
    expect(state.conversations.luna.pendingRegenerateText).toBe("retry this version");
  });
  it("persists and bounds custom character data for discover and chat", () => {
    const state = normalizeState({ customCharacters: [{ id: "custom-test", name: "Natalie", tagline: "A kind photographer", image: "/portrait.png", greeting: "Hi there", persona: "Warm and curious", tags: ["Romance", 3], visibility: "private", contentRating: "mature", initialMessages: ["One", 8], exampleDialogues: [{ user: "Hello", character: "Hey" }, { user: 4, character: "invalid" }], memoryEnabled: true, createdBy: "local", createdAt: 9 }, { id: "luna", name: "Not custom", tagline: "", image: "", greeting: "", persona: "" }] });
    expect(state.customCharacters).toHaveLength(1);
    expect(state.customCharacters[0]).toMatchObject({ id: "custom-test", visibility: "private", contentRating: "mature", tags: ["Romance"], initialMessages: ["One"], exampleDialogues: [{ user: "Hello", character: "Hey" }], memoryEnabled: true });
  });
  it("only grants demo Premium for a verified success with a billing period", () => {
    const outcomes = ["failed", "canceled", "pending"] as const;
    for (const outcome of outcomes) {
      const state = emptyState(); applyDemoBillingOutcome(state, outcome, "2099-01-01");
      expect(state.subscription.status).toBe(outcome);
      expect(state.subscription.periodEnd).toBeNull();
    }
    const state = emptyState(); applyDemoBillingOutcome(state, "success", "2099-01-01");
    expect(state.subscription.status).toBe("active");
    expect(state.subscription.periodEnd).toBe("2099-01-01");
    const missingPeriod = emptyState(); applyDemoBillingOutcome(missingPeriod, "success");
    expect(missingPeriod.subscription.status).toBe("free");
  });
});

describe("conversation versions and memory", () => {
  it("keeps explicit user facts newest-first", () => { const conversation = makeConversation("luna"); const next = extractMemory(conversation, "叫我小唐，喜欢不加糖的茶"); const corrected = extractMemory({ ...conversation, memory: next }, "叫我阿辰，改喝咖啡"); expect(corrected.userFacts).toEqual(["User prefers to be called 阿辰.", "User preference: 叫我阿辰，改喝咖啡"]); });
  it("produces deterministic fixture replies without claiming live AI", () => { const character = getCharacter("luna")!; expect(buildReply(character, "hello")).toBe(buildReply(character, "hello")); });
  it("reveals assistant replies paragraph by paragraph and keeps emoji intact", async () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { setTimeout: (callback: () => void) => { callback(); return 0; } } });
    try {
      const chunks: string[] = [];
      await streamText("First beat 😊\n\nSecond beat.", (chunk) => chunks.push(chunk));
      expect(chunks).toEqual(["First beat 😊", "\n\n", "Second beat."]);
    } finally {
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});

describe("character profile gallery", () => {
  it("uses only the active character's avatar and cover, deduplicating identical assets", () => {
    expect(getCharacterProfilePhotos({ image: "/hazel-avatar.png", coverImage: "/hazel-cover.png" })).toEqual(["/hazel-avatar.png", "/hazel-cover.png"]);
    expect(getCharacterProfilePhotos({ image: "/hazel-avatar.png", coverImage: "/hazel-avatar.png" })).toEqual(["/hazel-avatar.png"]);
  });
});

describe("chat session ordering", () => {
  it("keeps the session list ordered by recent activity instead of pinning the selected character", () => {
    const older = makeConversation("luna"); older.updatedAt = 10; older.messages = [{ id: "l1", role: "user", content: "hello", status: "saved", createdAt: 10 }];
    const newer = makeConversation("sora"); newer.updatedAt = 20; newer.messages = [{ id: "s1", role: "user", content: "hello", status: "saved", createdAt: 20 }];
    const conversations = { luna: older, sora: newer };
    expect(orderChatSessions(CHARACTERS, conversations, "luna").map((character) => character.id)).toEqual(["sora", "luna"]);
    expect(orderChatSessions(CHARACTERS, conversations, "mara").map((character) => character.id)).toEqual(["sora", "luna", "mara"]);
    older.updatedAt = 30;
    expect(orderChatSessions(CHARACTERS, conversations, "sora").map((character) => character.id)).toEqual(["luna", "sora"]);
  });
});

describe("browser persistence recovery", () => {
  it("can read an in-flight reservation without recovering it in another live tab", () => withWindowStorage({
    [STORAGE_KEY]: JSON.stringify({ usageReserved: 1, conversations: { luna: { characterId: "luna", messages: [{ id: "u1", role: "user", content: "hold on", status: "pending", createdAt: 1 }] } } }),
  }, () => {
    expect(loadState(false).usageReserved).toBe(1);
    const recovered = loadState();
    expect(recovered.usageReserved).toBe(0);
    expect(recovered.conversations.luna.messages[0].status).toBe("failed");
  }));

  it("backs up malformed saved data before the app writes a fresh state", () => withWindowStorage({ [STORAGE_KEY]: "{broken-json" }, () => {
    expect(loadState()).toEqual(emptyState());
    expect(hasCorruptStateBackup()).toBe(true);
    expect(window.localStorage.getItem(STORAGE_BACKUP_KEY)).toBe("{broken-json");
    expect(saveState(emptyState())).toBe(true);
    expect(window.localStorage.getItem(STORAGE_BACKUP_KEY)).toBe("{broken-json");
  }));

  it("reports storage quota failures instead of throwing into React", () => withWindowStorage({}, (storage) => {
    storage.setItem = () => { throw new DOMException("Storage full", "QuotaExceededError"); };
    expect(saveState(emptyState())).toBe(false);
  }));
});
