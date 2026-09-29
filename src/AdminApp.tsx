import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { assetUrl, createCharacterImage, debugChat, deleteAdminCharacter, deleteCharacterImage, duplicateAdminCharacter, getAdminToken, getHomepagePlacements, listAdminCharacters, listCharacterImages, saveAdminCharacter, saveHomepagePlacements, setAdminToken, updateCharacterImage, type AdminCharacter, type CharacterImage, type ChatResponse, type Placement } from "./api";
import "./admin.css";
import "./admin-status.css";
import "./admin-polish.css";
import "./admin-management.css";

type Tab = "characters" | "images" | "homepage" | "debug";
const emptyCharacter: Partial<AdminCharacter> = { name: "", tagline: "", tags: [], greeting: "", characterPrompt: "", modelProvider: "deepseek", modelName: "deepseek-flash", temperature: 0.8, maxTokens: 500, recentContextTurns: 20, memoryEnabled: true, status: "draft" };
const inputValue = (value: unknown) => value === undefined || value === null ? "" : String(value);

export default function AdminApp() {
  const [token, setTokenState] = useState(getAdminToken());
  const [authorized, setAuthorized] = useState(Boolean(getAdminToken()));
  const [tab, setTab] = useState<Tab>("characters");
  const [characters, setCharacters] = useState<AdminCharacter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<AdminCharacter>>(emptyCharacter);
  const [images, setImages] = useState<CharacterImage[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [debugConversation, setDebugConversation] = useState("");
  const [debugTurns, setDebugTurns] = useState<Array<{ user: string; response: ChatResponse }>>([]);
  const [debugText, setDebugText] = useState("");
  const [debugResult, setDebugResult] = useState<ChatResponse | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const selected = characters.find((character) => character.id === selectedId) || null;

  const refresh = async () => {
    setLoading(true); setNotice("");
    try { const [nextCharacters, nextPlacements] = await Promise.all([listAdminCharacters(), getHomepagePlacements()]); setCharacters(nextCharacters); setPlacements(nextPlacements); setApiConnected(true); if (!selectedId && nextCharacters[0]) { setSelectedId(nextCharacters[0].id); setDraft(nextCharacters[0]); } }
    catch (error) {
      setApiConnected(false);
      const message = String(error);
      setNotice(message.includes("ADMIN_AUTH_REQUIRED") ? "Admin token 无效。请点击左下角 Sign out 后重新输入 Token。" : "无法连接 Lureva API，请确认本地服务正在运行。");
    }
    finally { setLoading(false); }
  };
  useEffect(() => { if (authorized) void refresh(); }, [authorized]);
  useEffect(() => {
    let current = true;
    if (selected) {
      setDraft(selected);
      setImages([]);
      void listCharacterImages(selected.id).then((next) => { if (current) setImages(next); }).catch(() => { if (current) setImages([]); });
    } else setImages([]);
    return () => { current = false; };
  }, [selectedId]);
  const selectCharacter = (character: AdminCharacter) => { setSelectedId(character.id); setDraft(character); setTab("characters"); };
  const save = async () => {
    if (selected?.status === "online" && draft.status === "offline" && !window.confirm(`Take ${selected.name} offline? It will disappear from the public catalog.`)) return;
    setLoading(true);
    try { const saved = await saveAdminCharacter(draft); setCharacters((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); setSelectedId(saved.id); setDraft(saved); setNotice(saved.status === "online" ? `${saved.name} saved and published` : "Character saved"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Save failed"); }
    finally { setLoading(false); }
  };
  const setCharacterStatus = async (character: AdminCharacter) => {
    const nextStatus = character.status === "online" ? "offline" : "online";
    if (nextStatus === "offline" && !window.confirm(`Take ${character.name} offline? It will disappear from the public catalog.`)) return;
    setLoading(true);
    try {
      const saved = await saveAdminCharacter({ ...character, status: nextStatus });
      setCharacters((current) => current.map((item) => item.id === saved.id ? saved : item));
      if (selectedId === saved.id) setDraft(saved);
      setNotice(nextStatus === "online" ? `${saved.name} published` : `${saved.name} taken offline`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Status update failed"); }
    finally { setLoading(false); }
  };
  const saveDebugPrompt = async (characterPrompt: string) => {
    if (!selected) return;
    setLoading(true);
    try {
      const saved = await saveAdminCharacter({ ...selected, characterPrompt });
      setCharacters((current) => current.map((item) => item.id === saved.id ? saved : item));
      setDraft(saved);
      setNotice("Prompt saved · continue the same debug conversation");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Prompt save failed"); }
    finally { setLoading(false); }
  };
  const create = () => { setSelectedId(null); setDraft({ ...emptyCharacter, tags: [] }); setImages([]); setTab("characters"); };
  const remove = async () => {
    if (!selected || !window.confirm(`Delete ${selected.name}?`)) return;
    setLoading(true);
    try { await deleteAdminCharacter(selected.id); setCharacters((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(null); setDraft({ ...emptyCharacter, tags: [] }); setImages([]); setNotice("Character deleted"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Delete failed"); }
    finally { setLoading(false); }
  };
  const duplicate = async () => {
    if (!selected) return;
    setLoading(true);
    try { const copy = await duplicateAdminCharacter(selected.id); setCharacters((current) => [...current, copy]); setSelectedId(copy.id); setDraft(copy); setNotice("Draft copy created"); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Duplicate failed"); }
    finally { setLoading(false); }
  };
  const addImage = async (payload: Record<string, unknown>) => {
    if (!selected) return;
    const image = await createCharacterImage(selected.id, payload);
    setImages((current) => [...current, image]);
    setNotice("Image added");
  };
  const updateImage = async (id: string, payload: Partial<CharacterImage> & { dataUrl?: string }) => {
    try {
      const image = await updateCharacterImage(id, payload);
      setImages((current) => current.map((item) => item.id === id ? image : item));
      setNotice("Image asset saved");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Image update failed");
      throw error;
    }
  };
  const deleteImage = async (id: string) => {
    await deleteCharacterImage(id);
    setImages((current) => current.filter((item) => item.id !== id));
    setNotice("Image deleted");
  };
  const onLogin = (event: React.FormEvent) => { event.preventDefault(); setAdminToken(token.trim()); setAuthorized(true); };
  if (!authorized) return <div className="admin-auth"><div className="admin-auth-card"><div className="admin-mark">L</div><span className="admin-eyebrow">LUREVA OPERATIONS</span><h1>Admin Console</h1><p>Enter the local admin token to manage characters and debug the chat pipeline.</p><form onSubmit={onLogin}><input value={token} onChange={(event) => setTokenState(event.target.value)} placeholder="Admin token" autoFocus /><button type="submit">Open console</button></form><small>Local development access</small></div></div>;
  return <div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-brand"><span className="admin-mark">L</span><span>Lureva <small>Admin</small></span></div><nav>{([['characters', 'Characters'], ['images', 'Image library'], ['homepage', 'Homepage'], ['debug', 'Debug chat']] as const).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}<span>{key === "characters" ? characters.length : key === "images" ? images.length : ""}</span></button>)}</nav><div className="admin-sidebar-foot"><span className={apiConnected ? "admin-status" : "admin-status offline"}><i />{apiConnected ? "API connected" : "API unavailable"}</span><button onClick={() => { window.localStorage.removeItem("yellow-admin-token"); setAuthorized(false); }}>Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><span className="admin-eyebrow">OPERATIONS</span><h1>{tab === "characters" ? "Characters" : tab === "images" ? "Image library" : tab === "homepage" ? "Homepage placement" : "Debug chat"}</h1></div><div className="admin-top-actions"><span className={`admin-status ${apiConnected ? "" : "offline"}`}><i /> {apiConnected ? "Local API" : "API unavailable"}</span><button className="admin-quiet" onClick={() => void refresh()}>Refresh</button></div></header>{notice && <div className="admin-notice" role="status">{notice}</div>}
      {tab === "characters" && <CharacterPanel characters={characters} selected={selected} draft={draft} loading={loading} onSelect={selectCharacter} onCreate={create} onChange={setDraft} onSave={save} onDelete={remove} onDuplicate={duplicate} onToggleStatus={() => selected && void setCharacterStatus(selected)} />}
      {tab === "images" && <ImagePanel character={selected} images={images} onSavePolicy={async (policy) => { if (!selected) return; try { const saved = await saveAdminCharacter({ ...selected, ...policy }); setCharacters((current) => current.map((item) => item.id === saved.id ? saved : item)); setDraft(saved); setNotice("Image unlock settings saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Unlock settings failed"); } }} onAdd={addImage} onUpdate={updateImage} onDelete={deleteImage} />}
      {tab === "homepage" && <HomepagePanel characters={characters} placements={placements} onSave={async (next) => { try { const saved = await saveHomepagePlacements(next); setPlacements(saved); setNotice("Homepage order saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Homepage update failed"); throw error; } }} />}
      {tab === "debug" && <DebugPanel characters={characters} selectedId={selectedId} characterPrompt={inputValue(selected?.characterPrompt || selected?.persona)} conversationId={debugConversation} turns={debugTurns} text={debugText} result={debugResult} onCharacter={(id) => { setSelectedId(id); setDebugConversation(""); setDebugTurns([]); setDebugResult(null); }} onSavePrompt={saveDebugPrompt} saving={loading} onText={setDebugText} onReset={() => { setDebugConversation(""); setDebugTurns([]); setDebugResult(null); }} onSend={async () => { if (!selectedId || !debugText.trim()) return; const prompt = debugText; const result = await debugChat(selectedId, prompt, debugConversation || undefined); setDebugTurns((current) => [...current, { user: prompt, response: result }]); setDebugConversation(result.conversationId); setDebugResult(result); setDebugText(""); }} />}
    </main>
  </div>;
}

function CharacterPanel({ characters, selected, draft, loading, onSelect, onCreate, onChange, onSave, onDelete, onDuplicate, onToggleStatus }: { characters: AdminCharacter[]; selected: AdminCharacter | null; draft: Partial<AdminCharacter>; loading: boolean; onSelect: (character: AdminCharacter) => void; onCreate: () => void; onChange: (draft: Partial<AdminCharacter>) => void; onSave: () => void; onDelete: () => void; onDuplicate: () => void; onToggleStatus: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [section, setSection] = useState<"basics" | "prompt" | "model">("basics");
  const update = (key: keyof AdminCharacter, value: unknown) => onChange({ ...draft, [key]: value });
  const visibleCharacters = characters.filter((character) => {
    const search = query.trim().toLowerCase();
    const matchesQuery = !search || [character.name, character.id, character.tagline, character.shortDescription].some((value) => value?.toLowerCase().includes(search));
    return matchesQuery && (status === "all" || character.status === status);
  });
  return <div className="admin-content-grid">
    <section className="admin-list-card">
      <div className="admin-card-heading"><div><strong>Character catalog</strong><small>{characters.length} records</small></div><button className="admin-primary" onClick={onCreate}>+ New character</button></div>
      <div className="admin-search-row"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search characters" aria-label="Search characters" /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="draft">Draft</option><option value="online">Online</option><option value="offline">Offline</option></select></div>
      <div className="admin-character-list">{visibleCharacters.map((character) => <button className={`admin-character-row ${selected?.id === character.id ? "selected" : ""}`} key={character.id} onClick={() => onSelect(character)}><img src={assetUrl(character.avatarUrl || character.image)} alt="" /><span><strong>{character.name}</strong><small>{(character.tags || []).slice(0, 3).join(" · ") || character.tagline || character.shortDescription}</small><small>Updated {character.updatedAt ? new Date(character.updatedAt).toLocaleDateString() : "—"}</small></span><em className={`admin-pill ${character.status}`}>{character.status}</em></button>)}{visibleCharacters.length === 0 && <div className="admin-empty">No characters match these filters.</div>}</div>
    </section>
    <section className="admin-editor-card">
      <div className="admin-card-heading"><div><strong>{selected ? `Edit ${selected.name}` : "New character"}</strong><small>{selected ? `ID · ${selected.id}` : "Draft · not visible to users"}</small></div><div className="admin-heading-actions">{selected && <><button className="admin-quiet" onClick={onDuplicate} disabled={loading}>Duplicate</button><button className="admin-quiet" onClick={onToggleStatus} disabled={loading}>{selected.status === "online" ? "Take offline" : "Publish"}</button><button className="admin-danger" onClick={onDelete} disabled={loading}>Delete</button></>}</div></div>
      <div className="admin-editor-tabs" role="tablist" aria-label="Character settings">{([['basics', 'Basics'], ['prompt', 'Prompt'], ['model', 'Model & memory']] as const).map(([key, label]) => <button role="tab" aria-selected={section === key} className={section === key ? "active" : ""} key={key} onClick={() => setSection(key)}>{label}</button>)}</div>
      <div className="admin-form">
        {section === "basics" && <>
        <div className="admin-form-grid"><Field label="Name"><input value={inputValue(draft.name)} onChange={(event) => update("name", event.target.value)} placeholder="Luna Vale" /></Field><Field label="Status"><select value={inputValue(draft.status || "draft")} onChange={(event) => update("status", event.target.value)}><option value="draft">Draft</option><option value="online">Online</option><option value="offline">Offline</option></select></Field></div>
        <Field label="Short description"><input value={inputValue(draft.tagline || draft.shortDescription)} onChange={(event) => onChange({ ...draft, tagline: event.target.value, shortDescription: event.target.value })} maxLength={120} placeholder="One line users see on the card" /></Field>
        <Field label="Tags"><input value={(draft.tags || []).join(", ")} onChange={(event) => update("tags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="Romance, Cozy, Fantasy" /></Field>
        <Field label="Greeting"><textarea rows={3} value={inputValue(draft.greeting)} onChange={(event) => update("greeting", event.target.value)} /></Field>
        <div className="admin-upload-grid"><AssetUpload label="Avatar" value={draft.avatarUrl || draft.image} onUploaded={(value) => onChange({ ...draft, avatarUrl: value, image: value })} /><AssetUpload label="Cover image" value={draft.coverUrl || draft.image} onUploaded={(value) => onChange({ ...draft, coverUrl: value })} /></div>
        </>}
        {section === "prompt" && <>
        <Field label="Character prompt"><textarea className="prompt-area" rows={8} value={inputValue(draft.characterPrompt || draft.persona)} onChange={(event) => update("characterPrompt", event.target.value)} placeholder="Describe who this character is, how they speak, and what they should avoid." /></Field>
        <p className="admin-help-copy">Describe the character’s voice, boundaries and conversational habits. Keep instructions clear and avoid contradictory traits.</p>
        </>}
        {section === "model" && <>
        <div className="admin-form-grid"><Field label="Model"><input value={inputValue(draft.modelName)} onChange={(event) => update("modelName", event.target.value)} /></Field><Field label="Temperature"><input type="number" min="0" max="2" step="0.1" value={inputValue(draft.temperature)} onChange={(event) => update("temperature", Number(event.target.value))} /></Field><Field label="Max response tokens"><input type="number" min="64" max="4000" value={inputValue(draft.maxTokens)} onChange={(event) => update("maxTokens", Number(event.target.value))} /></Field><Field label="Recent context turns"><input type="number" min="1" max="100" value={inputValue(draft.recentContextTurns)} onChange={(event) => update("recentContextTurns", Number(event.target.value))} /></Field></div>
        <label className="admin-check"><input type="checkbox" checked={draft.memoryEnabled !== false} onChange={(event) => update("memoryEnabled", event.target.checked)} /> Enable summary memory</label>
        </>}
        <div className="admin-form-actions"><button className="admin-primary" onClick={onSave} disabled={loading}>{loading ? "Saving…" : draft.status === "online" ? "Save & publish" : "Save changes"}</button>{selected && <span className="admin-muted">Changes affect online content after save.</span>}</div>
      </div>
    </section>
  </div>;
}

function ImagePanel({ character, images, onSavePolicy, onAdd, onUpdate, onDelete }: { character: AdminCharacter | null; images: CharacterImage[]; onSavePolicy: (policy: Pick<AdminCharacter, "imageUnlockEnabled" | "imageUnlockMinTurns" | "imageUnlockCooldownTurns" | "imageUnlockMaxImagesPerConversation">) => Promise<void>; onAdd: (payload: Record<string, unknown>) => Promise<void>; onUpdate: (id: string, payload: Partial<CharacterImage> & { dataUrl?: string }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({ title: "", tags: ["cafe"], triggerType: "ai_intent", triggerCondition: { intent: "cafe" }, priority: 50, cooldownMessages: 3, enabled: true });
  const [policy, setPolicy] = useState({ imageUnlockEnabled: character?.imageUnlockEnabled !== false, imageUnlockMinTurns: character?.imageUnlockMinTurns ?? 2, imageUnlockCooldownTurns: character?.imageUnlockCooldownTurns ?? 3, imageUnlockMaxImagesPerConversation: character?.imageUnlockMaxImagesPerConversation ?? 3 });
  const [savingPolicy, setSavingPolicy] = useState(false);
  useEffect(() => {
    setPolicy({ imageUnlockEnabled: character?.imageUnlockEnabled !== false, imageUnlockMinTurns: character?.imageUnlockMinTurns ?? 2, imageUnlockCooldownTurns: character?.imageUnlockCooldownTurns ?? 3, imageUnlockMaxImagesPerConversation: character?.imageUnlockMaxImagesPerConversation ?? 3 });
  }, [character?.id, character?.imageUnlockEnabled, character?.imageUnlockMinTurns, character?.imageUnlockCooldownTurns, character?.imageUnlockMaxImagesPerConversation]);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const readFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setDataUrl(String(reader.result)); reader.readAsDataURL(file); };
  if (!character) return <EmptyPanel title="Select a character first" copy="Choose a character in the Characters tab, then manage its image pool here." />;
  const add = async () => {
    if (!dataUrl && !form.imageUrl) return;
    setSaving(true); setError("");
    const condition = inputValue(form.conditionText || (form.triggerCondition as Record<string, unknown>)?.intent);
    const triggerCondition = form.triggerType === "round"
      ? (() => { const [from, to] = condition.split(/[–-]/u).map(Number); return { fromTurn: Math.max(1, from || 1), toTurn: Math.max(from || 1, to || from || 1) }; })()
      : form.triggerType === "keyword"
        ? { keywords: condition.split(",").map((item) => item.trim()).filter(Boolean) }
        : { intent: condition };
    try { await onAdd({ ...form, triggerCondition, dataUrl: dataUrl || undefined, tags: String(form.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean) }); setDataUrl(null); setForm({ ...form, title: "" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Image upload failed"); }
    finally { setSaving(false); }
  };
  const visibleImages = images.filter((image) => `${image.title} ${image.tags.join(" ")} ${image.triggerType}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="admin-single-column">
    <section className="admin-card">
      <div className="admin-card-heading"><div><strong>{character.name} · Image unlock</strong><small>Images are eligible only after these conversation rules are met.</small></div></div>
      <div className="admin-form-grid">
        <Field label="Automatic image sending"><select value={policy.imageUnlockEnabled ? "on" : "off"} onChange={(event) => setPolicy({ ...policy, imageUnlockEnabled: event.target.value === "on" })}><option value="on">Enabled</option><option value="off">Disabled</option></select></Field>
        <Field label="Unlock after user turns"><input type="number" min="1" max="100" value={policy.imageUnlockMinTurns} onChange={(event) => setPolicy({ ...policy, imageUnlockMinTurns: Number(event.target.value) })} /></Field>
        <Field label="Cooldown between images (turns)"><input type="number" min="0" max="100" value={policy.imageUnlockCooldownTurns} onChange={(event) => setPolicy({ ...policy, imageUnlockCooldownTurns: Number(event.target.value) })} /></Field>
        <Field label="Max images per conversation"><input type="number" min="0" max="50" value={policy.imageUnlockMaxImagesPerConversation} onChange={(event) => setPolicy({ ...policy, imageUnlockMaxImagesPerConversation: Number(event.target.value) })} /></Field>
      </div>
      <div className="admin-panel-footer"><span className="admin-muted">Unlock policy is applied by the chat pipeline.</span><button className="admin-primary" disabled={savingPolicy} onClick={async () => { setSavingPolicy(true); try { await onSavePolicy(policy); } finally { setSavingPolicy(false); } }}>{savingPolicy ? "Saving…" : "Save unlock settings"}</button></div>
    </section>
    <section className="admin-card">
      <div className="admin-card-heading"><div><strong>{character.name} · Image pool</strong><small>{images.length} assets · {images.filter((image) => image.enabled).length} enabled</small></div><input className="admin-inline-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by title or scene tag" aria-label="Filter images" /></div>
      <div className="admin-image-grid">{visibleImages.map((image) => <ImageAssetCard key={image.id} image={image} onUpdate={onUpdate} onDelete={onDelete} />)}{!visibleImages.length && <div className="admin-empty">{images.length ? "No images match this filter." : "No images yet. Add the first asset below."}</div>}</div>
    </section>
    <section className="admin-card">
      <div className="admin-card-heading"><div><strong>Add image</strong><small>PNG, JPEG or WebP · local storage in MVP</small></div></div>
      <div className="admin-form-grid"><Field label="Image file"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={readFile} /></Field><Field label="Title"><input value={inputValue(form.title)} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Coffee shop · coffee" /></Field><Field label="Scene tags"><input value={Array.isArray(form.tags) ? form.tags.join(", ") : inputValue(form.tags)} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="cafe, coffee" /></Field><Field label="Trigger type"><select value={inputValue(form.triggerType)} onChange={(event) => setForm({ ...form, triggerType: event.target.value })}><option value="ai_intent">Scene intent</option><option value="round">Fixed round</option><option value="keyword">Keyword</option></select></Field><Field label={form.triggerType === "round" ? "Turn range (example: 5-8)" : form.triggerType === "keyword" ? "Keywords (comma separated)" : "Intent"}><input value={inputValue(form.conditionText ?? (form.triggerCondition as Record<string, unknown>)?.intent)} onChange={(event) => setForm({ ...form, conditionText: event.target.value })} placeholder={form.triggerType === "round" ? "5-8" : form.triggerType === "keyword" ? "selfie, photo" : "cafe"} /></Field><Field label="Priority"><input type="number" value={inputValue(form.priority)} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></Field><Field label="Per-image cooldown (turns)"><input type="number" min="0" value={inputValue(form.cooldownMessages)} onChange={(event) => setForm({ ...form, cooldownMessages: Number(event.target.value) })} /></Field></div>
      {dataUrl && <div className="admin-upload-preview"><img src={dataUrl} alt="Upload preview" /><span>Ready to upload</span></div>}{error && <div className="admin-error" role="alert">{error}</div>}<button className="admin-primary" onClick={() => void add()} disabled={saving || (!dataUrl && !form.imageUrl)}>{saving ? "Uploading…" : "Add image"}</button>
    </section>
  </div>;
}

function ImageAssetCard({ image, onUpdate, onDelete }: { image: CharacterImage; onUpdate: (id: string, payload: Partial<CharacterImage> & { dataUrl?: string }) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [title, setTitle] = useState(image.title);
  const [tags, setTags] = useState(image.tags.join(", "));
  const [triggerType, setTriggerType] = useState<CharacterImage["triggerType"]>(image.triggerType);
  const [condition, setCondition] = useState(image.triggerType === "round"
    ? `${inputValue(image.triggerCondition.fromTurn || 1)}-${inputValue(image.triggerCondition.toTurn || image.triggerCondition.fromTurn || 1)}`
    : image.triggerType === "keyword"
      ? Array.isArray(image.triggerCondition.keywords) ? image.triggerCondition.keywords.join(", ") : ""
      : inputValue(image.triggerCondition.intent));
  const [priority, setPriority] = useState(image.priority);
  const [cooldown, setCooldown] = useState(image.cooldownMessages);
  const [enabled, setEnabled] = useState(image.enabled);
  const [replacement, setReplacement] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState("");
  const readReplacement = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setReplacement(String(reader.result)); reader.readAsDataURL(file); };
  const save = async () => {
    setSaving(true); setFeedback("");
    const triggerCondition = triggerType === "round"
      ? (() => { const [from, to] = condition.split(/[–-]/u).map(Number); return { fromTurn: Math.max(1, from || 1), toTurn: Math.max(from || 1, to || from || 1) }; })()
      : triggerType === "keyword"
        ? { keywords: condition.split(",").map((item) => item.trim()).filter(Boolean) }
        : { intent: condition };
    try { await onUpdate(image.id, { title, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), triggerType, triggerCondition, priority: Number(priority), cooldownMessages: Number(cooldown), enabled, ...(replacement ? { dataUrl: replacement } : {}) }); setReplacement(""); setFeedback("Saved"); }
    catch (error) { setFeedback(error instanceof Error ? `Save failed · ${error.message}` : "Save failed"); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Delete ${image.title}?`)) return;
    setDeleting(true); setFeedback("");
    try { await onDelete(image.id); }
    catch (error) { setFeedback(error instanceof Error ? `Delete failed · ${error.message}` : "Delete failed"); }
    finally { setDeleting(false); }
  };
  return <article className="admin-image-card admin-image-card-edit">
    <img src={replacement || assetUrl(image.imageUrl)} alt={title} />
    <div className="admin-image-edit-body">
      <div className="admin-image-title-row"><strong>{title || "Untitled image"}</strong><span className={`admin-pill ${enabled ? "online" : "offline"}`}>{enabled ? "Enabled" : "Disabled"}</span></div>
      <Field label="Image name"><input value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
      <Field label="Scene tags"><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="cafe, coffee" /></Field>
      <div className="admin-form-grid"><Field label="Trigger"><select value={triggerType} onChange={(event) => setTriggerType(event.target.value as CharacterImage["triggerType"])}><option value="ai_intent">Scene intent</option><option value="round">Fixed round</option><option value="keyword">Keyword</option></select></Field><Field label={triggerType === "round" ? "Turn range (example: 5-8)" : triggerType === "keyword" ? "Keywords (comma separated)" : "Intent"}><input value={condition} onChange={(event) => setCondition(event.target.value)} placeholder={triggerType === "round" ? "5-8" : triggerType === "keyword" ? "selfie, photo" : "cafe"} /></Field></div>
      <div className="admin-form-grid"><Field label="Priority"><input type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} /></Field><Field label="Cooldown (turns)"><input type="number" min="0" value={cooldown} onChange={(event) => setCooldown(Number(event.target.value))} /></Field></div>
      <label className="admin-check"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Available for automatic matching</label>
      <Field label="Replace image"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={readReplacement} /></Field>
      {feedback && <small className={feedback.startsWith("Save failed") ? "admin-error" : "admin-save-hint"}>{feedback}</small>}
      <div className="admin-image-actions"><button className="admin-primary" onClick={() => void save()} disabled={saving || deleting}>{saving ? "Saving…" : "Save asset"}</button><button className="admin-danger-link" onClick={() => void remove()} disabled={saving || deleting}>{deleting ? "Deleting…" : "Delete"}</button></div>
    </div>
  </article>;
}

function HomepagePanel({ characters, placements, onSave }: { characters: AdminCharacter[]; placements: Placement[]; onSave: (placements: Placement[]) => Promise<void> }) {
  const [section, setSection] = useState("Featured");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const rows = useMemo(() => placements.filter((placement) => placement.section === section).sort((a, b) => a.position - b.position), [placements, section]);
  const categoryTags = characters.flatMap((character) => character.tags || []).filter((tag) => !["female", "male", "non-binary"].includes(tag.toLowerCase()));
  const sections = [...new Set(["Featured", "Popular", ...placements.map((placement) => placement.section), ...categoryTags])];
  const mergeRows = (nextRows: Placement[]) => [...placements.filter((placement) => placement.section !== section), ...nextRows.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }))];
  const persist = async (next: Placement[]) => { setSaving(true); setFeedback(""); try { await onSave(next); setFeedback("Saved to the live catalog"); } catch (error) { setFeedback(error instanceof Error ? `Save failed · ${error.message}` : "Save failed · please retry"); } finally { setSaving(false); } };
  const move = (index: number, direction: -1 | 1) => { const next = [...rows]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; void persist(mergeRows(next)); };
  const add = () => { const available = characters.find((character) => !rows.some((row) => row.characterId === character.id)); if (!available) return; void persist(mergeRows([...rows, { id: `placement-${Date.now()}`, characterId: available.id, section, position: rows.length + 1, weight: 50, enabled: true }])); };
  const toggle = (placement: Placement) => void persist(mergeRows(rows.map((row) => row.id === placement.id ? { ...row, enabled: !row.enabled } : row)));
  return <div className="admin-single-column">
    <section className="admin-card">
      <div className="admin-card-heading">
        <div><strong>Homepage sections</strong><small>Choose what appears on the homepage and arrange its order.</small></div>
        <div className="admin-heading-actions"><label className="admin-section-picker"><span>Section</span><select value={section} onChange={(event) => { setSection(event.target.value); setFeedback(""); }}>{sections.map((item) => <option key={item}>{item}</option>)}</select></label><button className="admin-primary" onClick={add} disabled={saving || !characters.some((character) => !rows.some((row) => row.characterId === character.id))}>+ Add character</button></div>
      </div>
      <div className="admin-placement-list">
        {rows.map((placement, index) => {
          const character = characters.find((item) => item.id === placement.characterId);
          return <div className={`admin-placement-row ${placement.enabled ? "" : "is-hidden"}`} key={placement.id}><strong>{index + 1}</strong>{character && <img src={assetUrl(character.avatarUrl || character.image)} alt="" />}<span>{character?.name || placement.characterId}<small>{placement.enabled ? "Shown on homepage" : "Hidden from homepage"}</small></span><button className="admin-quiet" onClick={() => toggle(placement)} disabled={saving}>{placement.enabled ? "Hide" : "Show"}</button><button aria-label={`Move ${character?.name || "character"} up`} onClick={() => move(index, -1)} disabled={saving || index === 0}>↑</button><button aria-label={`Move ${character?.name || "character"} down`} onClick={() => move(index, 1)} disabled={saving || index === rows.length - 1}>↓</button><button className="admin-danger-link" onClick={() => { if (window.confirm(`Remove ${character?.name || "this character"} from ${section}?`)) void persist(mergeRows(rows.filter((item) => item.id !== placement.id))); }} disabled={saving}>Remove</button></div>;
        })}
        {!rows.length && <div className="admin-empty">No characters placed in {section}. Add one to start this section.</div>}
      </div>
      <div className="admin-panel-footer"><span className="admin-muted" role="status">{saving ? "Saving homepage placement…" : feedback || "Changes take effect after saving."}</span><span className="admin-muted">{rows.filter((item) => item.enabled).length} visible</span></div>
    </section>
  </div>;
}

function DebugPanel({ characters, selectedId, characterPrompt, conversationId, turns, text, result, onCharacter, onSavePrompt, saving, onText, onReset, onSend }: { characters: AdminCharacter[]; selectedId: string | null; characterPrompt: string; conversationId: string; turns: Array<{ user: string; response: ChatResponse }>; text: string; result: ChatResponse | null; onCharacter: (id: string) => void; onSavePrompt: (prompt: string) => Promise<void>; saving: boolean; onText: (text: string) => void; onReset: () => void; onSend: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [promptDraft, setPromptDraft] = useState(characterPrompt);
  useEffect(() => setPromptDraft(characterPrompt), [selectedId, characterPrompt]);
  const send = async () => { setSending(true); setError(""); try { await onSend(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Debug request failed"); } finally { setSending(false); } };
  return <div className="admin-debug-grid"><section className="admin-card admin-debug-chat"><div className="admin-card-heading"><div><strong>{characters.find((item) => item.id === selectedId)?.name || "Character"} · Debug conversation</strong><small>Same chat pipeline as production · {turns.length} turns in this test</small></div><div className="admin-heading-actions"><select value={selectedId || ""} onChange={(event) => onCharacter(event.target.value)}><option value="">Select character</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select><button className="admin-quiet" onClick={onReset} disabled={!turns.length}>Reset</button></div></div><div className="admin-debug-transcript">{error && <div className="admin-error" role="alert">{error}</div>}{turns.length ? turns.map((turn, index) => <div className="admin-debug-turn" key={`${conversationId}-${index}`}><div className="admin-debug-user">You · {turn.user}</div><div className="admin-debug-assistant">{turn.response.message}</div>{turn.response.image && <figure><img src={assetUrl(turn.response.image.imageUrl)} alt={turn.response.image.title} /><figcaption>{turn.response.image.title}</figcaption></figure>}</div>) : !error && <div className="admin-empty">Send a message to inspect the prompt, memory and image matching. Your test transcript stays here while you iterate.</div>}</div><div className="admin-debug-composer"><textarea value={text} onChange={(event) => onText(event.target.value)} placeholder="Try: 今天想一起去喝咖啡吗？" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="admin-primary" onClick={() => void send()} disabled={sending || !text.trim() || !selectedId}>{sending ? "Sending…" : "Send"}</button></div></section><aside className="admin-debug-aside"><section className="admin-card admin-debug-panel"><div className="admin-card-heading"><div><strong>Prompt · quick edit</strong><small>Save here and continue this same conversation.</small></div></div><textarea className="admin-debug-prompt" value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} placeholder="Character voice, behavior, boundaries…" disabled={!selectedId} /><div className="admin-panel-footer"><span className="admin-muted">Saving updates this character’s live configuration.</span><button className="admin-primary" onClick={() => void onSavePrompt(promptDraft)} disabled={saving || !selectedId}>{saving ? "Saving…" : "Save prompt"}</button></div></section><section className="admin-card admin-debug-panel"><div className="admin-card-heading"><div><strong>Latest response</strong><small>Pipeline details</small></div></div>{result ? <><dl className="admin-debug-dl"><dt>Model</dt><dd>{result.debug.model}</dd><dt>Provider</dt><dd>{result.debug.provider}</dd><dt>Memory</dt><dd>{result.debug.memory}</dd><dt>Context tokens</dt><dd>{result.debug.contextTokens}</dd><dt>Image intent</dt><dd>{result.debug.imageIntent || "—"}</dd><dt>Matched image</dt><dd>{result.debug.matchedImage || "—"}</dd><dt>Image unlock</dt><dd>{result.debug.imageUnlock?.reason || "—"}{result.debug.imageUnlock?.remainingTurns ? ` · ${result.debug.imageUnlock.remainingTurns} turns left` : ""}</dd><dt>Latency</dt><dd>{result.debug.latencyMs} ms</dd></dl><details className="admin-memory-details"><summary>View memory context</summary><p>{result.debug.memory || "No memory summary is active yet."}</p></details></> : <div className="admin-muted admin-debug-empty">No request yet.</div>}</section></aside></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="admin-field"><span>{label}</span>{children}</label>; }
function AssetUpload({ label, value, onUploaded }: { label: string; value?: string | null; onUploaded: (value: string) => void }) {
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const read = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("Choose a PNG, JPEG or WebP image."); return; }
    setReading(true); setReady(false); setError("");
    const reader = new FileReader();
    reader.onload = () => { if (typeof reader.result === "string") { onUploaded(reader.result); setReady(true); } else setError("Could not read this image."); setReading(false); };
    reader.onerror = () => { setError("Could not read this image."); setReading(false); };
    reader.readAsDataURL(file);
  };
  return <div className="admin-asset-upload"><span>{label}</span>{value && <img src={assetUrl(value)} alt={`${label} preview`} />}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={read} />{reading && <small className="admin-muted" role="status">Preparing image…</small>}{ready && <small className="admin-save-hint" role="status">Image ready · save changes to apply</small>}{error && <small className="admin-error" role="alert">{error}</small>}</div>;
}
function EmptyPanel({ title, copy }: { title: string; copy: string }) { return <section className="admin-card admin-empty-panel"><h2>{title}</h2><p>{copy}</p></section>; }
