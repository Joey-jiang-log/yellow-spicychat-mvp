import { describe, expect, it } from "vitest";
import { applyDemoBillingOutcome, buildReply, commitReply, emptyState, extractMemory, makeConversation, normalizeState, quotaRemaining, recoverInterruptedGeneration, releaseReply, reserveReply } from "../src/domain";
import { getCharacter } from "../src/data";

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
});
