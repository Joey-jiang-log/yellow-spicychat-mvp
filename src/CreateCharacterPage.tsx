import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2, Upload, X } from "lucide-react";
import type { Character } from "./data";

type Props = { onCreate: (character: Character) => void };
const suggestions = ["Romance", "Fantasy", "Adventure", "Comfort", "Female", "Male"];

export default function CreateCharacterPage({ onCreate }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [persona, setPersona] = useState("");
  const [greeting, setGreeting] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [initialMessages, setInitialMessages] = useState([""]);
  const [scenario, setScenario] = useState("");
  const [dialogues, setDialogues] = useState([{ user: "", character: "" }]);
  const [toggles, setToggles] = useState({ memoryEnabled: false, sceneImagesEnabled: false, proactiveMessagesEnabled: false, advancedModelEnabled: false });
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [contentRating, setContentRating] = useState<"general" | "mature">("general");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [imageError, setImageError] = useState("");
  useEffect(() => { if (!preview) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape") setPreview(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [preview]);

  const readFile = (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { setImageError("Choose a PNG, JPG, or WebP image."); return; }
    if (file.size > 700_000) { setImageError("Please use an image smaller than 700 KB for this local demo."); return; }
    const reader = new FileReader(); reader.onload = () => { setImage(String(reader.result ?? "")); setImageError(""); }; reader.readAsDataURL(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); readFile(event.dataTransfer.files[0]); };
  const addTag = (value = tagInput) => { const next = value.trim().replace(/^#/, "").slice(0, 24); if (next && !tags.some((tag) => tag.toLowerCase() === next.toLowerCase()) && tags.length < 8) setTags((current) => [...current, next]); setTagInput(""); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !tagline.trim() || !persona.trim() || !greeting.trim()) { setError("Add a name, short description, personality, and greeting to continue."); return; }
    const fallback = "/characters/luna.png";
    const character: Character = {
      id: `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`,
      name: name.trim(), tagline: tagline.trim(), persona: persona.trim(), greeting: greeting.trim(), tags, image: image || fallback,
      ...(image ? { coverImage: image } : {}), scenario: scenario.trim(), initialMessages: initialMessages.map((message) => message.trim()).filter(Boolean), exampleDialogues: dialogues.filter((item) => item.user.trim() || item.character.trim()).map((item) => ({ user: item.user.trim(), character: item.character.trim() })),
      ...toggles, visibility, contentRating, createdAt: Date.now(),
    };
    onCreate(character);
  };
  const moveMessage = (index: number, step: number) => setInitialMessages((items) => { const next = [...items]; const target = index + step; if (target < 0 || target >= items.length) return items; [next[index], next[target]] = [next[target], next[index]]; return next; });

  return <>
    <div className="create-wrap">
      <div className="create-heading"><span className="eyebrow">CHARACTER STUDIO</span><h1>Create a character</h1><p>Shape someone new to meet in Lureva.</p></div>
      <form className="character-form" onSubmit={submit}>
        <section className="form-section"><SectionTitle number="01" title="Character image" hint="A portrait helps your character stand out." />
          <div className={`image-drop ${dragging ? "is-dragging" : ""} ${image ? "has-image" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
            {image ? <><img src={image} alt="Character preview" /><div className="image-drop-actions"><button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={15} /> Replace</button><button type="button" className="secondary-button" onClick={() => { setImage(""); if (fileRef.current) fileRef.current.value = ""; }}><Trash2 size={15} /> Remove</button></div></> : <button type="button" className="image-drop-prompt" onClick={() => fileRef.current?.click()}><span><ImagePlus size={25} /></span><strong>Drop an image here or browse</strong><small>PNG, JPG or WebP · up to 700 KB · stored in this browser</small></button>}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => readFile(event.target.files?.[0])} />
          </div>{imageError && <p className="field-error">{imageError}</p>}
        </section>
        <section className="form-section"><SectionTitle number="02" title="The essentials" />
          <Field label="Character name" count={`${name.length}/40`}><input aria-label="Character name" required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Natalie" /></Field>
          <Field label="Short description" count={`${tagline.length}/120`}><input aria-label="Short description" required maxLength={120} value={tagline} onChange={(event) => setTagline(event.target.value)} placeholder="A photographer who makes ordinary nights feel like an adventure." /></Field>
          <Field label="Personality" hint="Define their nature, voice, behavior, and how they interact with you." count={`${persona.length}/5000`}><textarea aria-label="Personality" required maxLength={5000} rows={5} value={persona} onChange={(event) => setPersona(event.target.value)} placeholder="Thoughtful, playful, observant… How do they speak? What matters to them?" /></Field>
          <Field label="Greeting" hint="The first thing your character says when a conversation begins." count={`${greeting.length}/2000`}><textarea aria-label="Greeting" required maxLength={2000} rows={3} value={greeting} onChange={(event) => setGreeting(event.target.value)} placeholder="The cafe is nearly empty when Natalie looks up from her camera…" /></Field>
          <Field label="Tags" hint="Add up to 8 tags to help people find this character."><div className="tag-entry" onClick={() => document.getElementById("character-tag-input")?.focus()}>{tags.map((tag) => <span className="form-chip" key={tag}>{tag}<button type="button" aria-label={`Remove ${tag}`} onClick={() => setTags((items) => items.filter((item) => item !== tag))}><X size={12} /></button></span>)}<input id="character-tag-input" value={tagInput} onChange={(event) => setTagInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } if (event.key === "Backspace" && !tagInput) setTags((items) => items.slice(0, -1)); }} placeholder={tags.length ? "Add another…" : "Type a tag and press Enter"} /></div><div className="suggested-tags">{suggestions.filter((item) => !tags.includes(item)).map((tag) => <button type="button" key={tag} onClick={() => addTag(tag)}>+ {tag}</button>)}</div></Field>
        </section>
        <section className="form-section"><SectionTitle number="03" title="Openers & setting" />
          <Field label="Initial messages" hint="Alternative opening lines. Reorder with the arrows (up to 5)."><div className="opening-list">{initialMessages.map((message, index) => <div className="opening-item" key={index}><div className="opening-label"><strong>Message {index + 1}</strong><div><button type="button" aria-label="Move up" disabled={!index} onClick={() => moveMessage(index, -1)}><ArrowUp size={14} /></button><button type="button" aria-label="Move down" disabled={index === initialMessages.length - 1} onClick={() => moveMessage(index, 1)}><ArrowDown size={14} /></button><button type="button" aria-label="Remove message" disabled={initialMessages.length === 1} onClick={() => setInitialMessages((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button></div></div><textarea rows={2} value={message} onChange={(event) => setInitialMessages((items) => items.map((item, itemIndex) => index === itemIndex ? event.target.value : item))} placeholder="An optional alternate opening…" /></div>)}</div>{initialMessages.length < 5 && <button className="inline-add" type="button" onClick={() => setInitialMessages((items) => [...items, ""])}><Plus size={15} /> Add an opening</button>}</Field>
          <Field label="Scenario" hint="Where do you meet, and what is happening around you?"><textarea aria-label="Scenario" rows={3} value={scenario} onChange={(event) => setScenario(event.target.value)} placeholder="A late-night photo walk through the old part of town…" /></Field>
        </section>
        <section className="form-section"><SectionTitle number="04" title="Advanced settings" />
          <div className="feature-toggles">{([ ["memoryEnabled", "Long-term memory", "Remember details across conversations."], ["sceneImagesEnabled", "Scene images", "Allow visual scene moments (preview only)."], ["proactiveMessagesEnabled", "Proactive messages", "Let the character start a conversation (preview only)."], ["advancedModelEnabled", "Advanced model", "Use a more capable model (preview only)."] ] as const).map(([key, title, detail]) => <label className="feature-toggle" key={key}><span><strong>{title}</strong><small>{detail}</small></span><input type="checkbox" checked={toggles[key]} onChange={(event) => setToggles((current) => ({ ...current, [key]: event.target.checked }))} /><i /></label>)}</div>
          <Field label="Example dialogue" hint="Show the voice you want with a short user/character exchange."><div className="dialogue-list">{dialogues.map((pair, index) => <div className="dialogue-pair" key={index}><label><span>You</span><textarea rows={2} value={pair.user} onChange={(event) => setDialogues((items) => items.map((item, itemIndex) => index === itemIndex ? { ...item, user: event.target.value } : item))} placeholder="What the user says" /></label><label><span>Character</span><textarea rows={2} value={pair.character} onChange={(event) => setDialogues((items) => items.map((item, itemIndex) => index === itemIndex ? { ...item, character: event.target.value } : item))} placeholder="How your character replies" /></label>{dialogues.length > 1 && <button type="button" className="remove-dialogue" aria-label="Remove dialogue" onClick={() => setDialogues((items) => items.filter((_, itemIndex) => index !== itemIndex))}><X size={14} /></button>}</div>)}</div><button className="inline-add" type="button" disabled={dialogues.length >= 5} onClick={() => setDialogues((items) => [...items, { user: "", character: "" }])}><Plus size={15} /> Add example</button></Field>
        </section>
        <section className="form-section"><SectionTitle number="05" title="Audience & visibility" />
          <Field label="Visibility" hint="Private characters are stored only in this browser demo."><Choice name="visibility" value="public" current={visibility} onChange={(value) => setVisibility(value as "public" | "private")} title="Public" detail="Show in Discover" /><Choice name="visibility" value="private" current={visibility} onChange={(value) => setVisibility(value as "public" | "private")} title="Private" detail="Only in My account" /></Field>
          <Field label="Content rating" hint="Mature is a label only; explicit content is not supported."><Choice name="rating" value="general" current={contentRating} onChange={(value) => setContentRating(value as "general" | "mature")} title="General" detail="Suitable for a broad audience" /><Choice name="rating" value="mature" current={contentRating} onChange={(value) => setContentRating(value as "general" | "mature")} title="Mature" detail="For adult audiences" /></Field>
        </section>
        {error && <p className="form-submit-error" role="alert">{error}</p>}
        <div className="create-actions"><button className="secondary-button" type="button" disabled={!name.trim()} onClick={() => setPreview(true)}>Preview character</button><button className="primary-button create-submit" type="submit">Create character <span>→</span></button><small>Your character is saved locally on this device.</small></div>
      </form>
    </div>
    {preview && <div className="modal-backdrop" onClick={() => setPreview(false)}><section className="character-preview-modal" role="dialog" aria-modal="true" aria-label="Character preview" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setPreview(false)} aria-label="Close preview"><X size={18} /></button><img src={image || "/characters/luna.png"} alt="" /><div className="preview-copy"><span className="eyebrow">CHARACTER PREVIEW</span><h2>{name || "Your character"}</h2><p>{tagline || "A short description will appear here."}</p><div className="card-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div><blockquote>{greeting || "Your character’s greeting will appear here."}</blockquote></div><button className="primary-button full" onClick={() => setPreview(false)}>Looks good</button></section></div>}
  </>;
}

function SectionTitle({ number, title, hint }: { number: string; title: string; hint?: string }) { return <div className="form-section-title"><span>{number}</span><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div></div>; }
function Field({ label, hint, count, children }: { label: string; hint?: string; count?: string; children: ReactNode }) { return <div className="form-field"><span className="form-label"><strong>{label}</strong>{count && <small>{count}</small>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</div>; }
function Choice({ name, value, current, onChange, title, detail }: { name: string; value: string; current: string; onChange: (value: string) => void; title: string; detail: string }) { return <label className={`choice-card ${current === value ? "selected" : ""}`}><input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} /><span><strong>{title}</strong><small>{detail}</small></span></label>; }
