import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import { assetUrl, createCharacterImage, debugChat, deleteAdminCharacter, deleteCharacterImage, duplicateAdminCharacter, getAdminToken, getHomepagePlacements, listAdminCharacters, listCharacterImages, saveAdminCharacter, saveHomepagePlacements, setAdminToken, updateCharacterImage, type AdminCharacter, type CharacterImage, type Placement } from "./api";
import "./admin.css";
import "./admin-status.css";

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
  const [debugText, setDebugText] = useState("");
  const [debugResult, setDebugResult] = useState<{ message: string; image: CharacterImage | null; debug: { model: string; provider: string; imageIntent: string | null; matchedImage: string | null; memory: string; contextTokens: number; latencyMs: number } } | null>(null);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiConnected, setApiConnected] = useState(false);
  const [debugLastUserText, setDebugLastUserText] = useState("");
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
  const save = async () => { setLoading(true); try { const saved = await saveAdminCharacter(draft); setCharacters((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [...current, saved]); setSelectedId(saved.id); setDraft(saved); setNotice("Character saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Save failed"); } finally { setLoading(false); } };
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
  const onLogin = (event: React.FormEvent) => { event.preventDefault(); setAdminToken(token.trim()); setAuthorized(true); };
  if (!authorized) return <div className="admin-auth"><div className="admin-auth-card"><div className="admin-mark">L</div><span className="admin-eyebrow">LUREVA OPERATIONS</span><h1>Admin Console</h1><p>Enter the local admin token to manage characters and debug the chat pipeline.</p><form onSubmit={onLogin}><input value={token} onChange={(event) => setTokenState(event.target.value)} placeholder="Admin token" autoFocus /><button type="submit">Open console</button></form><small>Local development access</small></div></div>;
  return <div className="admin-shell">
    <aside className="admin-sidebar"><div className="admin-brand"><span className="admin-mark">L</span><span>Lureva <small>Admin</small></span></div><nav>{([['characters', 'Characters'], ['images', 'Image library'], ['homepage', 'Homepage'], ['debug', 'Debug chat']] as const).map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}<span>{key === "characters" ? characters.length : key === "images" ? images.length : ""}</span></button>)}</nav><div className="admin-sidebar-foot"><span className={apiConnected ? "admin-status" : "admin-status offline"}><i />{apiConnected ? "API connected" : "API unavailable"}</span><button onClick={() => { window.localStorage.removeItem("yellow-admin-token"); setAuthorized(false); }}>Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><span className="admin-eyebrow">OPERATIONS</span><h1>{tab === "characters" ? "Characters" : tab === "images" ? "Image library" : tab === "homepage" ? "Homepage placement" : "Debug chat"}</h1></div><div className="admin-top-actions"><span className={`admin-status ${apiConnected ? "" : "offline"}`}><i /> {apiConnected ? "Local API" : "API unavailable"}</span><button className="admin-quiet" onClick={() => void refresh()}>Refresh</button></div></header>{notice && <div className="admin-notice" role="status">{notice}</div>}
      {tab === "characters" && <CharacterPanel characters={characters} selected={selected} draft={draft} loading={loading} onSelect={selectCharacter} onCreate={create} onChange={setDraft} onSave={save} onDelete={remove} onDuplicate={duplicate} />}
      {tab === "images" && <ImagePanel character={selected} images={images} onAdd={async (payload) => { if (!selected) return; const image = await createCharacterImage(selected.id, payload); setImages((current) => [...current, image]); setNotice("Image added"); }} onUpdate={async (id, payload) => { try { const image = await updateCharacterImage(id, payload); setImages((current) => current.map((item) => item.id === id ? image : item)); } catch (error) { setNotice(error instanceof Error ? error.message : "Image update failed"); } }} onDelete={async (id) => { try { await deleteCharacterImage(id); setImages((current) => current.filter((item) => item.id !== id)); } catch (error) { setNotice(error instanceof Error ? error.message : "Image delete failed"); } }} />}
      {tab === "homepage" && <HomepagePanel characters={characters} placements={placements} onSave={async (next) => { try { const saved = await saveHomepagePlacements(next); setPlacements(saved); setNotice("Homepage order saved"); } catch (error) { setNotice(error instanceof Error ? error.message : "Homepage update failed"); } }} />}
      {tab === "debug" && <DebugPanel characters={characters} selectedId={selectedId} conversationId={debugConversation} text={debugText} lastUserText={debugLastUserText} result={debugResult} onCharacter={(id) => { setSelectedId(id); setDebugConversation(""); setDebugLastUserText(""); setDebugResult(null); }} onText={setDebugText} onReset={() => { setDebugConversation(""); setDebugLastUserText(""); setDebugResult(null); }} onSend={async () => { if (!selectedId || !debugText.trim()) return; const prompt = debugText; const result = await debugChat(selectedId, prompt, debugConversation || undefined); setDebugLastUserText(prompt); setDebugConversation(result.conversationId); setDebugResult(result); setDebugText(""); }} />}
    </main>
  </div>;
}

function CharacterPanel({ characters, selected, draft, loading, onSelect, onCreate, onChange, onSave, onDelete, onDuplicate }: { characters: AdminCharacter[]; selected: AdminCharacter | null; draft: Partial<AdminCharacter>; loading: boolean; onSelect: (character: AdminCharacter) => void; onCreate: () => void; onChange: (draft: Partial<AdminCharacter>) => void; onSave: () => void; onDelete: () => void; onDuplicate: () => void }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
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
      <div className="admin-character-list">{visibleCharacters.map((character) => <button className={`admin-character-row ${selected?.id === character.id ? "selected" : ""}`} key={character.id} onClick={() => onSelect(character)}><img src={assetUrl(character.avatarUrl || character.image)} alt="" /><span><strong>{character.name}</strong><small>{character.tagline || character.shortDescription}</small></span><em className={`admin-pill ${character.status}`}>{character.status}</em></button>)}{visibleCharacters.length === 0 && <div className="admin-empty">No characters match these filters.</div>}</div>
    </section>
    <section className="admin-editor-card">
      <div className="admin-card-heading"><div><strong>{selected ? `Edit ${selected.name}` : "New character"}</strong><small>{selected ? `ID · ${selected.id}` : "Draft · not visible to users"}</small></div><div className="admin-heading-actions">{selected && <><button className="admin-quiet" onClick={onDuplicate}>Duplicate</button><button className="admin-danger" onClick={onDelete}>Delete</button></>}</div></div>
      <div className="admin-form">
        <div className="admin-form-grid"><Field label="Name"><input value={inputValue(draft.name)} onChange={(event) => update("name", event.target.value)} placeholder="Luna Vale" /></Field><Field label="Status"><select value={inputValue(draft.status || "draft")} onChange={(event) => update("status", event.target.value)}><option value="draft">Draft</option><option value="online">Online</option><option value="offline">Offline</option></select></Field></div>
        <Field label="Short description"><input value={inputValue(draft.tagline || draft.shortDescription)} onChange={(event) => onChange({ ...draft, tagline: event.target.value, shortDescription: event.target.value })} maxLength={120} placeholder="One line users see on the card" /></Field>
        <Field label="Tags"><input value={(draft.tags || []).join(", ")} onChange={(event) => update("tags", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} placeholder="Romance, Cozy, Fantasy" /></Field>
        <Field label="Greeting"><textarea rows={3} value={inputValue(draft.greeting)} onChange={(event) => update("greeting", event.target.value)} /></Field>
        <Field label="Character prompt"><textarea className="prompt-area" rows={8} value={inputValue(draft.characterPrompt || draft.persona)} onChange={(event) => update("characterPrompt", event.target.value)} placeholder="Describe who this character is, how they speak, and what they should avoid." /></Field>
        <div className="admin-form-grid"><Field label="Model"><input value={inputValue(draft.modelName)} onChange={(event) => update("modelName", event.target.value)} /></Field><Field label="Temperature"><input type="number" min="0" max="2" step="0.1" value={inputValue(draft.temperature)} onChange={(event) => update("temperature", Number(event.target.value))} /></Field><Field label="Max response tokens"><input type="number" min="64" max="4000" value={inputValue(draft.maxTokens)} onChange={(event) => update("maxTokens", Number(event.target.value))} /></Field><Field label="Recent context turns"><input type="number" min="1" max="100" value={inputValue(draft.recentContextTurns)} onChange={(event) => update("recentContextTurns", Number(event.target.value))} /></Field></div>
        <div className="admin-upload-grid"><AssetUpload label="Avatar" value={draft.avatarUrl || draft.image} onUploaded={(value) => onChange({ ...draft, avatarUrl: value, image: value })} /><AssetUpload label="Cover image" value={draft.coverUrl || draft.image} onUploaded={(value) => onChange({ ...draft, coverUrl: value })} /></div>
        <label className="admin-check"><input type="checkbox" checked={draft.memoryEnabled !== false} onChange={(event) => update("memoryEnabled", event.target.checked)} /> Enable summary memory</label>
        <div className="admin-form-actions"><button className="admin-primary" onClick={onSave} disabled={loading}>Save changes</button>{selected && <span className="admin-muted">Changes affect online content after save.</span>}</div>
      </div>
    </section>
  </div>;
}

function ImagePanel({ character, images, onAdd, onUpdate, onDelete }: { character: AdminCharacter | null; images: CharacterImage[]; onAdd: (payload: Record<string, unknown>) => Promise<void>; onUpdate: (id: string, payload: Partial<CharacterImage>) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({ title: "", tags: ["casual"], triggerType: "ai_intent", triggerCondition: { intent: "casual" }, priority: 50, cooldownMessages: 20, enabled: true });
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const readFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => setDataUrl(String(reader.result)); reader.readAsDataURL(file); };
  if (!character) return <EmptyPanel title="Select a character first" copy="Choose a character in the Characters tab, then manage its image pool here." />;
  const add = async () => {
    if (!dataUrl && !form.imageUrl) return;
    setSaving(true); setError("");
    try { await onAdd({ ...form, dataUrl: dataUrl || undefined, tags: String(form.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean) }); setDataUrl(null); setForm({ ...form, title: "" }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Image upload failed"); }
    finally { setSaving(false); }
  };
  return <div className="admin-single-column"><section className="admin-card"><div className="admin-card-heading"><div><strong>{character.name} · Image pool</strong><small>{images.length} configured assets</small></div><span className="admin-muted">Select a tag, then trigger it from Debug chat</span></div><div className="admin-image-grid">{images.map((image) => <article className="admin-image-card" key={image.id}><img src={assetUrl(image.imageUrl)} alt={image.title} /><div><strong>{image.title}</strong><small>{image.tags.join(", ")} · {image.triggerType}</small><label className="admin-check"><input type="checkbox" checked={image.enabled} onChange={(event) => void onUpdate(image.id, { enabled: event.target.checked })} /> Enabled</label><button className="admin-danger-link" onClick={() => void onDelete(image.id)}>Delete</button></div></article>)}{!images.length && <div className="admin-empty">No images yet. Add the first asset below.</div>}</div></section><section className="admin-card"><div className="admin-card-heading"><div><strong>Add image</strong><small>PNG, JPEG or WebP · local storage in MVP</small></div></div><div className="admin-form-grid"><Field label="Image file"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={readFile} /></Field><Field label="Title"><input value={inputValue(form.title)} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Date night 01" /></Field><Field label="Tags"><input value={Array.isArray(form.tags) ? form.tags.join(", ") : inputValue(form.tags)} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="date, romantic" /></Field><Field label="Trigger type"><select value={inputValue(form.triggerType)} onChange={(event) => setForm({ ...form, triggerType: event.target.value })}><option value="ai_intent">AI intent</option><option value="round">Fixed round</option><option value="keyword">Keyword</option></select></Field><Field label="Intent / condition"><input value={inputValue((form.triggerCondition as Record<string, unknown>)?.intent)} onChange={(event) => setForm({ ...form, triggerCondition: { intent: event.target.value } })} placeholder="date" /></Field><Field label="Priority"><input type="number" value={inputValue(form.priority)} onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })} /></Field><Field label="Cooldown messages"><input type="number" value={inputValue(form.cooldownMessages)} onChange={(event) => setForm({ ...form, cooldownMessages: Number(event.target.value) })} placeholder="" /></Field></div>{error && <div className="admin-error" role="alert">{error}</div>}<button className="admin-primary" onClick={() => void add()} disabled={saving || (!dataUrl && !form.imageUrl)}>{saving ? "Uploading…" : "Add image"}</button></section></div>;
}

function HomepagePanel({ characters, placements, onSave }: { characters: AdminCharacter[]; placements: Placement[]; onSave: (placements: Placement[]) => Promise<void> }) {
  const [section, setSection] = useState("Featured");
  const rows = useMemo(() => placements.filter((placement) => placement.section === section).sort((a, b) => a.position - b.position), [placements, section]);
  const mergeRows = (nextRows: Placement[]) => [...placements.filter((placement) => placement.section !== section), ...nextRows.map((item, itemIndex) => ({ ...item, position: itemIndex + 1 }))];
  const move = (index: number, direction: -1 | 1) => { const next = [...rows]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; void onSave(mergeRows(next)); };
  const add = () => { const available = characters.find((character) => !rows.some((row) => row.characterId === character.id)); if (!available) return; void onSave(mergeRows([...rows, { id: `placement-${Date.now()}`, characterId: available.id, section, position: rows.length + 1, weight: 50, enabled: true }])); };
  return <div className="admin-single-column"><section className="admin-card"><div className="admin-card-heading"><div><strong>Homepage sections</strong><small>Character content stays separate from presentation order.</small></div><div className="admin-heading-actions"><select value={section} onChange={(event) => setSection(event.target.value)}><option>Featured</option><option>Popular</option><option>Romance</option><option>Fantasy</option></select><button className="admin-primary" onClick={add}>+ Add character</button></div></div><div className="admin-placement-list">{rows.map((placement, index) => { const character = characters.find((item) => item.id === placement.characterId); return <div className="admin-placement-row" key={placement.id}><strong>{index + 1}</strong>{character && <img src={assetUrl(character.avatarUrl || character.image)} alt="" />}<span>{character?.name || placement.characterId}<small>{placement.enabled ? "Visible" : "Hidden"}</small></span><button onClick={() => move(index, -1)} disabled={index === 0}>↑</button><button onClick={() => move(index, 1)} disabled={index === rows.length - 1}>↓</button><button className="admin-danger-link" onClick={() => void onSave(mergeRows(rows.filter((item) => item.id !== placement.id)))}>Remove</button></div>; })}{!rows.length && <div className="admin-empty">No characters placed in this section.</div>}</div></section></div>;
}

function DebugPanel({ characters, selectedId, conversationId, text, lastUserText, result, onCharacter, onText, onReset, onSend }: { characters: AdminCharacter[]; selectedId: string | null; conversationId: string; text: string; lastUserText: string; result: { message: string; image: CharacterImage | null; debug: { model: string; provider: string; imageIntent: string | null; matchedImage: string | null; memory: string; contextTokens: number; latencyMs: number } } | null; onCharacter: (id: string) => void; onText: (text: string) => void; onReset: () => void; onSend: () => Promise<void> }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const send = async () => { setSending(true); setError(""); try { await onSend(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Debug request failed"); } finally { setSending(false); } };
  return <div className="admin-debug-grid"><section className="admin-card admin-debug-chat"><div className="admin-card-heading"><div><strong>Draft conversation</strong><small>Uses the same server pipeline as the public chat API.</small></div><div className="admin-heading-actions"><select value={selectedId || ""} onChange={(event) => onCharacter(event.target.value)}><option value="">Select character</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select><button className="admin-quiet" onClick={onReset}>Reset</button></div></div><div className="admin-debug-transcript">{error && <div className="admin-error" role="alert">{error}</div>}{result ? <><div className="admin-debug-user">You · {lastUserText}</div><div className="admin-debug-assistant">{result.message}</div>{result.image && <img src={assetUrl(result.image.imageUrl)} alt={result.image.title} />}</> : !error && <div className="admin-empty">Send a message to inspect the prompt, model and image trigger result.</div>}</div><div className="admin-debug-composer"><textarea value={text} onChange={(event) => onText(event.target.value)} placeholder="Try: show me something from date night…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} /><button className="admin-primary" onClick={() => void send()} disabled={sending || !text.trim() || !selectedId}>{sending ? "Sending…" : "Send"}</button></div></section><aside className="admin-card admin-debug-panel"><div className="admin-card-heading"><div><strong>Debug details</strong><small>Last request metadata</small></div></div>{result ? <dl className="admin-debug-dl"><dt>Model</dt><dd>{result.debug.model}</dd><dt>Provider</dt><dd>{result.debug.provider}</dd><dt>Memory</dt><dd>{result.debug.memory}</dd><dt>Context tokens</dt><dd>{result.debug.contextTokens}</dd><dt>Image intent</dt><dd>{result.debug.imageIntent || "—"}</dd><dt>Matched image</dt><dd>{result.debug.matchedImage || "—"}</dd><dt>Latency</dt><dd>{result.debug.latencyMs} ms</dd></dl> : <div className="admin-muted">No request yet.</div>}</aside></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="admin-field"><span>{label}</span>{children}</label>; }
function AssetUpload({ label, value, onUploaded }: { label: string; value?: string | null; onUploaded: (value: string) => void }) { const read = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => onUploaded(String(reader.result)); reader.readAsDataURL(file); }; return <div className="admin-asset-upload"><span>{label}</span>{value && <img src={assetUrl(value)} alt="" />}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={read} /></div>; }
function EmptyPanel({ title, copy }: { title: string; copy: string }) { return <section className="admin-card admin-empty-panel"><h2>{title}</h2><p>{copy}</p></section>; }
