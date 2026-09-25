import type { Character } from "./data";

export const DEMO_MODE = true;
export const FREE_LIMIT = 20;
export const PAID_LIMIT = 1000;
export const PLAN = { price: "$9.99", interval: "month", replies: 1000, memory: "Longer memory" } as const;
export const STORAGE_KEY = "yellow-demo-state-v1";

export type Role = "user" | "assistant";
export type MessageStatus = "saved" | "pending" | "streaming" | "failed";
export type MessageVariant = { id: string; content: string; createdAt: number };
export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  status: MessageStatus;
  createdAt: number;
  variants?: MessageVariant[];
  activeVariantId?: string;
};
export type Conversation = {
  id: string;
  characterId: string;
  messages: ChatMessage[];
  pendingRegenerateText?: string;
  updatedAt: number;
  contextRevision: number;
  memory: { userFacts: string[]; storyState: string; summaryThrough: string | null; contextRevision: number };
};
export type DemoState = {
  userId: string | null;
  usageCommitted: number;
  usageReserved: number;
  subscription: { status: "free" | "active" | "canceled" | "pending" | "failed"; periodEnd: string | null; committed: number };
  favorites: string[];
  conversations: Record<string, Conversation>;
  drafts: Record<string, string>;
};
export type DemoBillingOutcome = "success" | "failed" | "canceled" | "pending";

export const emptyState = (): DemoState => ({
  userId: null, usageCommitted: 0, usageReserved: 0,
  subscription: { status: "free", periodEnd: null, committed: 0 }, favorites: [], conversations: {}, drafts: {},
});

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const nonNegativeInt = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
const messageStatuses: MessageStatus[] = ["saved", "pending", "streaming", "failed"];

const normalizeMessage = (value: unknown, index: number): ChatMessage | null => {
  if (!isRecord(value) || (value.role !== "user" && value.role !== "assistant") || typeof value.content !== "string") return null;
  const status = messageStatuses.includes(value.status as MessageStatus) ? value.status as MessageStatus : "saved";
  const variants = Array.isArray(value.variants)
    ? value.variants.filter(isRecord).filter((variant) => typeof variant.id === "string" && typeof variant.content === "string").map((variant) => ({ id: variant.id as string, content: variant.content as string, createdAt: nonNegativeInt(variant.createdAt, Date.now()) }))
    : undefined;
  return {
    id: typeof value.id === "string" && value.id ? value.id : `message-${index}`,
    role: value.role,
    content: value.content,
    status,
    createdAt: nonNegativeInt(value.createdAt, Date.now()),
    ...(variants?.length ? { variants } : {}),
    ...(typeof value.activeVariantId === "string" ? { activeVariantId: value.activeVariantId } : {}),
  };
};

const normalizeConversation = (value: unknown, key: string): Conversation | null => {
  if (!isRecord(value)) return null;
  const characterId = typeof value.characterId === "string" && value.characterId ? value.characterId : key;
  const rawMemory = isRecord(value.memory) ? value.memory : {};
  const userFacts = Array.isArray(rawMemory.userFacts) ? rawMemory.userFacts.filter((fact): fact is string => typeof fact === "string").slice(-8) : [];
  const contextRevision = nonNegativeInt(value.contextRevision, nonNegativeInt(rawMemory.contextRevision));
  return {
    id: typeof value.id === "string" && value.id ? value.id : `conversation-${characterId}`,
    characterId,
    messages: Array.isArray(value.messages) ? value.messages.map(normalizeMessage).filter((message): message is ChatMessage => Boolean(message)) : [],
    ...(typeof value.pendingRegenerateText === "string" ? { pendingRegenerateText: value.pendingRegenerateText } : {}),
    updatedAt: nonNegativeInt(value.updatedAt, Date.now()),
    contextRevision,
    memory: {
      userFacts,
      storyState: typeof rawMemory.storyState === "string" ? rawMemory.storyState : "The conversation has just begun.",
      summaryThrough: typeof rawMemory.summaryThrough === "string" ? rawMemory.summaryThrough : null,
      contextRevision,
    },
  };
};

export const normalizeState = (value: unknown): DemoState => {
  const base = emptyState();
  if (!isRecord(value)) return base;
  const rawSubscription = isRecord(value.subscription) ? value.subscription : {};
  const status = ["free", "active", "canceled", "pending", "failed"].includes(rawSubscription.status as string) ? rawSubscription.status as DemoState["subscription"]["status"] : base.subscription.status;
  const conversations: Record<string, Conversation> = {};
  if (isRecord(value.conversations)) {
    Object.entries(value.conversations).forEach(([key, conversation]) => {
      const normalized = normalizeConversation(conversation, key);
      if (normalized) conversations[key] = normalized;
    });
  }
  const drafts: Record<string, string> = {};
  if (isRecord(value.drafts)) Object.entries(value.drafts).forEach(([key, draft]) => { if (typeof draft === "string") drafts[key] = draft; });
  return {
    userId: typeof value.userId === "string" && value.userId ? value.userId : null,
    usageCommitted: nonNegativeInt(value.usageCommitted),
    usageReserved: nonNegativeInt(value.usageReserved),
    subscription: {
      status,
      periodEnd: typeof rawSubscription.periodEnd === "string" ? rawSubscription.periodEnd : null,
      committed: nonNegativeInt(rawSubscription.committed),
    },
    favorites: Array.isArray(value.favorites) ? value.favorites.filter((favorite): favorite is string => typeof favorite === "string") : [],
    conversations,
    drafts,
  };
};

export const recoverInterruptedGeneration = (state: DemoState) => {
  if (state.usageReserved <= 0) return state;
  Object.values(state.conversations).forEach((conversation) => {
    conversation.messages = conversation.messages.filter((message) => !(message.role === "assistant" && (message.status === "pending" || message.status === "streaming")));
    conversation.messages.forEach((message) => { if (message.role === "user" && message.status === "pending") message.status = "failed"; });
  });
  state.usageReserved = 0;
  return state;
};

export const loadState = (): DemoState => {
  if (typeof window === "undefined") return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    return recoverInterruptedGeneration(normalizeState(JSON.parse(raw)));
  } catch { return emptyState(); }
};

export const saveState = (state: DemoState) => {
  if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const quotaLimit = (state: DemoState) => state.subscription.status === "active" ? PAID_LIMIT : FREE_LIMIT;
export const quotaUsed = (state: DemoState) => state.subscription.status === "active" ? state.subscription.committed : state.usageCommitted;
export const quotaRemaining = (state: DemoState) => Math.max(0, quotaLimit(state) - quotaUsed(state) - state.usageReserved);

export const reserveReply = (state: DemoState) => {
  if (quotaRemaining(state) <= 0 || state.usageReserved > 0) return false;
  state.usageReserved += 1;
  return true;
};

export const commitReply = (state: DemoState) => {
  state.usageReserved = Math.max(0, state.usageReserved - 1);
  if (state.subscription.status === "active") state.subscription.committed += 1;
  else state.usageCommitted += 1;
};

export const releaseReply = (state: DemoState) => { state.usageReserved = Math.max(0, state.usageReserved - 1); };

export const applyDemoBillingOutcome = (state: DemoState, outcome: DemoBillingOutcome, periodEnd: string | null = null) => {
  if (outcome === "success" && periodEnd) state.subscription = { status: "active", committed: 0, periodEnd };
  if (outcome === "failed") state.subscription = { ...state.subscription, status: "failed", periodEnd: null };
  if (outcome === "canceled") state.subscription = { ...state.subscription, status: "canceled", periodEnd: null };
  if (outcome === "pending") state.subscription = { ...state.subscription, status: "pending", periodEnd: null };
  return state;
};

export const makeConversation = (characterId: string): Conversation => ({
  id: `conversation-${characterId}`,
  characterId,
  messages: [],
  updatedAt: Date.now(),
  contextRevision: 0,
  memory: { userFacts: [], storyState: "The conversation has just begun.", summaryThrough: null, contextRevision: 0 },
});

export const buildReply = (character: Character, userText: string, regenerate = false) => {
  const text = userText.trim();
  const variants = regenerate
    ? [
      `*${character.name} considers your words, then lets the first answer go.*\n\n“Then let’s take the less obvious route. I know a place where the noise falls away, and we can decide what comes next when we get there.”`,
      `*${character.name} turns toward you, the room settling into its own rhythm.*\n\n“Stay with me for one more minute. There’s a version of this night we haven’t tried yet, and I think it begins with your next question.”`,
    ]
    : [
      `*${character.name} lets the moment breathe before answering.*\n\n“I like the way you put that. We don’t need to rush the next part — tell me what you noticed first.”`,
      `*A small smile crosses ${character.name}’s face.*\n\n“Then we have somewhere to begin. Keep talking; I’m listening for the detail you almost left out.”`,
    ];
  const seed = Array.from(text).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return variants[seed % variants.length];
};

export const extractMemory = (conversation: Conversation, latestUserText: string) => {
  const normalized = latestUserText.toLowerCase();
  const facts = [...conversation.memory.userFacts];
  const nameMatch = latestUserText.match(/(?:叫我|称呼我|call me)\s*([\u4e00-\u9fa5A-Za-z][\u4e00-\u9fa5A-Za-z0-9_-]{0,12})/i);
  if (nameMatch) {
    const next = `User prefers to be called ${nameMatch[1]}.`;
    for (let index = facts.length - 1; index >= 0; index -= 1) if (facts[index].startsWith("User prefers to be called")) facts.splice(index, 1);
    facts.push(next);
  }
  if (normalized.includes("茶") || normalized.includes("tea") || normalized.includes("咖啡") || normalized.includes("coffee")) {
    const next = `User preference: ${latestUserText.trim()}`;
    for (let index = facts.length - 1; index >= 0; index -= 1) if (facts[index].startsWith("User preference:")) facts.splice(index, 1);
    facts.push(next);
  }
  return { ...conversation.memory, userFacts: facts.slice(-8), contextRevision: conversation.contextRevision };
};

export const streamText = async (content: string, onDelta: (value: string) => void) => {
  const chunks = content.match(/.{1,12}/gs) ?? [content];
  for (const chunk of chunks) { await new Promise((resolve) => window.setTimeout(resolve, 45)); onDelta(chunk); }
};
