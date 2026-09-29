import { getCharacter } from "./data";

export type AdminCharacter = {
  id: string; name: string; tagline?: string; shortDescription?: string; avatarUrl?: string | null; coverUrl?: string | null;
  image?: string; tags: string[]; greeting: string; persona?: string; characterPrompt?: string; modelProvider: string; modelName: string;
  temperature: number; maxTokens: number; recentContextTurns: number; memoryEnabled: boolean; status: "draft" | "online" | "offline"; createdAt: string; updatedAt: string;
  imageUnlockEnabled?: boolean; imageUnlockMinTurns?: number; imageUnlockCooldownTurns?: number; imageUnlockMaxImagesPerConversation?: number;
};
export type PublicCharacter = Pick<AdminCharacter, "id" | "name" | "tags" | "greeting"> & {
  tagline?: string; shortDescription?: string; avatarUrl?: string | null; coverUrl?: string | null; image?: string; status?: "online"; homepagePlacements?: Array<Pick<Placement, "section" | "position" | "enabled">>;
};
export type CharacterImage = { id: string; characterId: string; imageUrl: string; title: string; description: string; tags: string[]; triggerType: "round" | "ai_intent" | "keyword"; triggerCondition: Record<string, unknown>; priority: number; cooldownMessages: number; enabled: boolean; createdAt: string; updatedAt: string };
export type Placement = { id: string; characterId: string; section: string; position: number; weight: number; enabled: boolean };
export type ServerConversation = { id: string; userId: string; characterId: string; environment: "debug" | "production"; messages: Array<{ id: string; role: "user" | "assistant"; content: string; imageId: string | null; imageUrl?: string | null; imageTitle?: string | null; sceneId?: string; createdAt: string }>; createdAt: string; updatedAt: string };
export type ImageUnlockDebug = { unlocked: boolean; reason: string; turn: number; minTurns: number; sentImages: number; maxImages: number; remainingTurns?: number };
export type ChatResponse = { conversationId: string; message: string; image: CharacterImage | null; debug: { model: string; provider: string; imageIntent: string | null; matchedImage: string | null; imageUnlock: ImageUnlockDebug | null; memory: string; contextTokens: number; latencyMs: number } };
export type InlineChatCharacter = { name: string; greeting: string; persona: string; scenario?: string; exampleDialogues?: Array<{ user: string; character: string }> };
export type ServiceHealth = { ok: boolean; service: string; provider: string; model: string; configured: boolean };
export const isLiveChatConfigured = (health: ServiceHealth) => health.ok && health.provider === "deepseek" && health.configured;
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const tokenKey = "yellow-admin-token";
export const getAdminToken = () => typeof window === "undefined" ? "" : window.localStorage.getItem(tokenKey) || "";
export const setAdminToken = (token: string) => window.localStorage.setItem(tokenKey, token);
export const assetUrl = (value: string | null | undefined) => value && value.startsWith("/uploads/") ? `${API_BASE}${value}` : value || "";
const builtInCharacterIds = ["cass", "ivy", "jules", "kai", "lena", "luna", "mara", "milo", "noa", "rowan", "sora", "theo"];
const uploadedPublicPortraits = [
  ["sashimi", "sashimi-cafe.png"],
  ["hazel-smith", "seed-hazel-smith.png"],
  ["kai-k-o-nakamura", "seed-kai-k-o-nakamura.png"],
  ["rina", "seed-rina.png"],
  ["mina-eun-hee", "seed-mina-eun-hee.png"],
  ["vespera", "seed-vespera.png"],
  ["stella", "seed-stella.png"],
  ["anna", "seed-anna.png"],
  ["selena-everett", "seed-selena-everett.png"],
  ["mari-hickman", "seed-mari-hickman.png"],
  ["lady-valerie", "seed-lady-valerie.png"],
] as const;
const optimizedCharacterImages: Record<string, string> = Object.fromEntries([
  ...builtInCharacterIds.map((id) => [`/characters/${id}.png`, `/characters/optimized/${id}-900-v1.jpg`]),
  ...uploadedPublicPortraits.map(([id, filename]) => [`/uploads/${filename}`, `/characters/optimized/${id}-900-v1.jpg`]),
]);
export const optimizeBundledCharacterImage = (value: string | null | undefined) => value ? optimizedCharacterImages[value] || value : "";
export const characterCardImageSrcSet = (value: string | null | undefined) => value && /^\/characters\/optimized\/[a-z0-9-]+-900-v1\.jpg$/u.test(value)
  ? `${value.replace("-900-v1.jpg", "-640-v2.jpg")} 640w`
  : undefined;
export const toFrontendCharacter = (character: Pick<AdminCharacter, "id" | "name" | "tags" | "greeting"> & Partial<AdminCharacter> & Pick<PublicCharacter, "homepagePlacements">) => ({ id: character.id, name: character.name, tagline: character.tagline || character.shortDescription || "", tags: character.tags || [], image: optimizeBundledCharacterImage(character.avatarUrl || character.image) || "/characters/optimized/luna-900-v1.jpg", coverImage: optimizeBundledCharacterImage(character.coverUrl || character.avatarUrl || character.image) || "/characters/optimized/luna-900-v1.jpg", greeting: character.greeting || "", persona: character.persona || character.characterPrompt || "", sceneStarters: getCharacter(character.id)?.sceneStarters, homepagePlacements: character.homepagePlacements || [] });
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers); if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json"); const token = getAdminToken(); if (token) headers.set("x-admin-token", token);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(response.ok ? "The API returned an invalid response." : `Request failed: ${response.status}`); }
  }
  if (!response.ok) {
    const error = payload && typeof payload === "object" ? payload as { message?: string; error?: string } : {};
    throw new Error(error.message || error.error || `Request failed: ${response.status}`);
  }
  return payload as T;
}
export const listAdminCharacters = () => apiFetch<AdminCharacter[]>("/api/admin/characters");
export const listPublicCharacters = () => apiFetch<PublicCharacter[]>("/api/characters").then((characters) => characters.map(toFrontendCharacter));
export const getServiceHealth = () => apiFetch<ServiceHealth>("/api/health");
let browserSessionRequest: Promise<{ id: string; displayName: string; persistence: "browser-bound" }> | null = null;
export const getBrowserSession = () => {
  if (!browserSessionRequest) browserSessionRequest = apiFetch<{ id: string; displayName: string; persistence: "browser-bound" }>("/api/session", { cache: "no-store" }).catch((error) => { browserSessionRequest = null; throw error; });
  return browserSessionRequest;
};
export const saveAdminCharacter = (character: Partial<AdminCharacter> & { id?: string }) => character.id ? apiFetch<AdminCharacter>(`/api/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify(character) }) : apiFetch<AdminCharacter>("/api/admin/characters", { method: "POST", body: JSON.stringify(character) });
export const deleteAdminCharacter = (id: string) => apiFetch<void>(`/api/admin/characters/${id}`, { method: "DELETE" });
export const duplicateAdminCharacter = (id: string) => apiFetch<AdminCharacter>(`/api/admin/characters/${id}/duplicate`, { method: "POST" });
export const listCharacterImages = (characterId: string) => apiFetch<CharacterImage[]>("/api/admin/images").then((images) => images.filter((image) => image.characterId === characterId));
export const createCharacterImage = (characterId: string, payload: Record<string, unknown>) => apiFetch<CharacterImage>(`/api/admin/characters/${characterId}/images`, { method: "POST", body: JSON.stringify(payload) });
export const updateCharacterImage = (id: string, payload: Partial<CharacterImage> & { dataUrl?: string }) => apiFetch<CharacterImage>(`/api/admin/character-images/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteCharacterImage = (id: string) => apiFetch<void>(`/api/admin/character-images/${id}`, { method: "DELETE" });
export const getHomepagePlacements = () => apiFetch<Placement[]>("/api/admin/homepage");
export const saveHomepagePlacements = (placements: Placement[]) => apiFetch<Placement[]>("/api/admin/homepage", { method: "PATCH", body: JSON.stringify({ placements }) });
export const debugChat = (characterId: string, message: string, conversationId?: string) => apiFetch<ChatResponse>("/api/admin/debug/chat", { method: "POST", body: JSON.stringify({ characterId, message, conversationId, environment: "debug" }) });
export const listConversations = (userId: string) => apiFetch<ServerConversation[]>(`/api/conversations?userId=${encodeURIComponent(userId)}`);
export const getCurrentUser = (userId: string) => apiFetch<{ id: string; displayName: string }>(`/api/users/me?userId=${encodeURIComponent(userId)}`);
export const sendChat = (characterId: string, message: string, conversationId?: string, userId = "demo-user", character?: InlineChatCharacter) => apiFetch<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ userId, characterId, message, conversationId, character, environment: "production" }) });
export const regenerateChat = (characterId: string, conversationId: string, userId = "demo-user", character?: InlineChatCharacter) => apiFetch<ChatResponse>("/api/chat/regenerate", { method: "POST", body: JSON.stringify({ userId, characterId, conversationId, character, environment: "production" }) });

export async function readChatEventStream(response: Response, onDelta: (text: string) => void): Promise<ChatResponse> {
  if (!response.body) throw new Error("The chat stream is unavailable. Please retry.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ChatResponse | null = null;
  const consumeFrame = (frame: string) => {
    const data = frame.split(/\r?\n/u).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return;
    const event = JSON.parse(data) as { type?: string; text?: string; message?: string; result?: ChatResponse };
    if (event.type === "delta" && typeof event.text === "string") onDelta(event.text);
    else if (event.type === "complete" && event.result) result = event.result;
    else if (event.type === "error") throw new Error(event.message || "The character could not reply. Please retry.");
  };
  while (true) {
    const next = await reader.read();
    buffer += decoder.decode(next.value, { stream: !next.done });
    const frames = buffer.split(/\r?\n\r?\n/u);
    buffer = frames.pop() ?? "";
    frames.forEach(consumeFrame);
    if (next.done) break;
  }
  if (buffer.trim()) consumeFrame(buffer);
  if (!result) throw new Error("The reply ended before it was saved. Please retry.");
  return result;
}

async function streamChat(path: string, body: Record<string, unknown>, onDelta: (text: string) => void, signal: AbortSignal): Promise<ChatResponse> {
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal, credentials: "include" });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string; error?: string } | null;
    throw new Error(payload?.message || payload?.error || `Request failed: ${response.status}`);
  }
  return readChatEventStream(response, onDelta);
}

export const sendChatStream = (characterId: string, message: string, conversationId: string | undefined, requestId: string, userId: string, character: InlineChatCharacter | undefined, onDelta: (text: string) => void, signal: AbortSignal, sceneId?: string) => streamChat("/api/chat/stream", { userId, characterId, message, conversationId, requestId, character, environment: "production", ...(sceneId ? { sceneId } : {}) }, onDelta, signal);
export const regenerateChatStream = (characterId: string, conversationId: string, requestId: string, userId: string, character: InlineChatCharacter | undefined, onDelta: (text: string) => void, signal: AbortSignal) => streamChat("/api/chat/regenerate/stream", { userId, characterId, conversationId, requestId, character, environment: "production" }, onDelta, signal);
