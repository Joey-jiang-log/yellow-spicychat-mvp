export type AdminCharacter = {
  id: string; name: string; tagline?: string; shortDescription?: string; avatarUrl?: string | null; coverUrl?: string | null;
  image?: string; tags: string[]; greeting: string; persona?: string; characterPrompt?: string; modelProvider: string; modelName: string;
  temperature: number; maxTokens: number; recentContextTurns: number; memoryEnabled: boolean; status: "draft" | "online" | "offline"; createdAt: string; updatedAt: string;
};
export type PublicCharacter = Pick<AdminCharacter, "id" | "name" | "tags" | "greeting"> & {
  tagline?: string; shortDescription?: string; avatarUrl?: string | null; coverUrl?: string | null; image?: string; status?: "online";
};
export type CharacterImage = { id: string; characterId: string; imageUrl: string; title: string; description: string; tags: string[]; triggerType: "round" | "ai_intent" | "keyword"; triggerCondition: Record<string, unknown>; priority: number; cooldownMessages: number; enabled: boolean; createdAt: string; updatedAt: string };
export type Placement = { id: string; characterId: string; section: string; position: number; weight: number; enabled: boolean };
export type ServerConversation = { id: string; userId: string; characterId: string; environment: "debug" | "production"; messages: Array<{ id: string; role: "user" | "assistant"; content: string; imageId: string | null; imageUrl?: string | null; createdAt: string }>; createdAt: string; updatedAt: string };
export type ChatResponse = { conversationId: string; message: string; image: CharacterImage | null; debug: { model: string; provider: string; imageIntent: string | null; matchedImage: string | null; memory: string; contextTokens: number; latencyMs: number } };
export type InlineChatCharacter = { name: string; greeting: string; persona: string; scenario?: string; exampleDialogues?: Array<{ user: string; character: string }> };
const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const tokenKey = "yellow-admin-token";
export const getAdminToken = () => typeof window === "undefined" ? "" : window.localStorage.getItem(tokenKey) || "";
export const setAdminToken = (token: string) => window.localStorage.setItem(tokenKey, token);
export const assetUrl = (value: string | null | undefined) => value && value.startsWith("/uploads/") ? `${API_BASE}${value}` : value || "";
export const toFrontendCharacter = (character: Pick<AdminCharacter, "id" | "name" | "tags" | "greeting"> & Partial<AdminCharacter>) => ({ id: character.id, name: character.name, tagline: character.tagline || character.shortDescription || "", tags: character.tags || [], image: character.avatarUrl || character.image || "/characters/luna.png", coverImage: character.coverUrl || character.avatarUrl || character.image || "/characters/luna.png", greeting: character.greeting || "", persona: character.persona || character.characterPrompt || "" });
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers); if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json"); const token = getAdminToken(); if (token) headers.set("x-admin-token", token);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
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
export const saveAdminCharacter = (character: Partial<AdminCharacter> & { id?: string }) => character.id ? apiFetch<AdminCharacter>(`/api/admin/characters/${character.id}`, { method: "PATCH", body: JSON.stringify(character) }) : apiFetch<AdminCharacter>("/api/admin/characters", { method: "POST", body: JSON.stringify(character) });
export const deleteAdminCharacter = (id: string) => apiFetch<void>(`/api/admin/characters/${id}`, { method: "DELETE" });
export const duplicateAdminCharacter = (id: string) => apiFetch<AdminCharacter>(`/api/admin/characters/${id}/duplicate`, { method: "POST" });
export const listCharacterImages = (characterId: string) => apiFetch<CharacterImage[]>("/api/admin/images").then((images) => images.filter((image) => image.characterId === characterId));
export const createCharacterImage = (characterId: string, payload: Record<string, unknown>) => apiFetch<CharacterImage>(`/api/admin/characters/${characterId}/images`, { method: "POST", body: JSON.stringify(payload) });
export const updateCharacterImage = (id: string, payload: Partial<CharacterImage>) => apiFetch<CharacterImage>(`/api/admin/character-images/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
export const deleteCharacterImage = (id: string) => apiFetch<void>(`/api/admin/character-images/${id}`, { method: "DELETE" });
export const getHomepagePlacements = () => apiFetch<Placement[]>("/api/admin/homepage");
export const saveHomepagePlacements = (placements: Placement[]) => apiFetch<Placement[]>("/api/admin/homepage", { method: "PATCH", body: JSON.stringify({ placements }) });
export const debugChat = (characterId: string, message: string, conversationId?: string) => apiFetch<{ conversationId: string; message: string; image: CharacterImage | null; debug: { model: string; provider: string; imageIntent: string | null; matchedImage: string | null; memory: string; contextTokens: number; latencyMs: number } }>("/api/admin/debug/chat", { method: "POST", body: JSON.stringify({ characterId, message, conversationId, environment: "debug" }) });
export const listConversations = (userId: string) => apiFetch<ServerConversation[]>(`/api/conversations?userId=${encodeURIComponent(userId)}`);
export const getCurrentUser = (userId: string) => apiFetch<{ id: string; displayName: string }>(`/api/users/me?userId=${encodeURIComponent(userId)}`);
export const sendChat = (characterId: string, message: string, conversationId?: string, userId = "demo-user", character?: InlineChatCharacter) => apiFetch<ChatResponse>("/api/chat", { method: "POST", body: JSON.stringify({ userId, characterId, message, conversationId, character, environment: "production" }) });
export const regenerateChat = (characterId: string, conversationId: string, userId = "demo-user", character?: InlineChatCharacter) => apiFetch<ChatResponse>("/api/chat/regenerate", { method: "POST", body: JSON.stringify({ userId, characterId, conversationId, character, environment: "production" }) });
