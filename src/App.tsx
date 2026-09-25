import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Clock3, Heart, Home, LockKeyhole, LogIn, LogOut, Menu, MessageCircle, RotateCcw, Search, Send, Sparkles, UserRound, X, Zap } from "lucide-react";
import { CHARACTERS, getCharacter, TAGS, type Character } from "./data";
import { applyDemoBillingOutcome, buildReply, commitReply, DEMO_MODE, emptyState, extractMemory, FREE_LIMIT, loadState, makeConversation, PLAN, quotaLimit, quotaRemaining, quotaUsed, releaseReply, reserveReply, saveState, streamText, type ChatMessage, type Conversation, type DemoBillingOutcome, type DemoState } from "./domain";

type DemoPaymentMode = "failed" | "canceled" | "pending";
type Route = { page: "home" | "chat" | "subscribe" | "me"; characterId?: string; returnTo?: string; demoPayment?: DemoPaymentMode };
const safeReturnTo = (value: string | null) => {
  if (value === "/") return "/";
  if (value === "/me" || value === "/me#recent") return value;
  const match = value?.match(/^\/chat\/([^/]+)$/);
  return match && getCharacter(match[1]) ? `/chat/${match[1]}` : "/";
};
const parseRoute = (): Route => {
  const path = window.location.pathname;
  const chatMatch = path.match(/^\/chat\/([^/]+)$/);
  if (chatMatch) return { page: "chat", characterId: chatMatch[1], returnTo: safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) };
  if (path.startsWith("/chat/")) return { page: "chat" };
  if (/^\/subscribe\/?$/.test(path)) {
    const params = new URLSearchParams(window.location.search);
    const demoPayment = DEMO_MODE && ["failed", "canceled", "pending"].includes(params.get("demoPayment") ?? "") ? params.get("demoPayment") as DemoPaymentMode : undefined;
    return { page: "subscribe", returnTo: safeReturnTo(params.get("returnTo")), demoPayment };
  }
  if (/^\/me\/?$/.test(path)) return { page: "me" };
  return { page: "home" };
};

const navigate = (to: string) => { window.history.pushState({}, "", to); window.dispatchEvent(new PopStateEvent("popstate")); };

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [state, setState] = useState<DemoState>(loadState);
  const [loginOpen, setLoginOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [loginFocus, setLoginFocus] = useState<HTMLElement | null>(null);
  const [paywallFocus, setPaywallFocus] = useState<HTMLElement | null>(null);
  const [loginIntent, setLoginIntent] = useState<"subscribe" | { type: "favorite"; characterId: string } | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homeTag, setHomeTag] = useState("All");
  const [homeLoading, setHomeLoading] = useState(false);

  useEffect(() => { const onPop = () => setRoute(parseRoute()); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useLayoutEffect(() => {
    if (route.page === "me" && window.location.hash === "#recent") {
      window.requestAnimationFrame(() => document.getElementById("recent")?.scrollIntoView({ block: "start", behavior: "auto" }));
    }
  }, [route]);
  useEffect(() => {
    if (route.page === "chat" && (!route.characterId || !getCharacter(route.characterId))) {
      window.history.replaceState({}, "", "/");
      setRoute({ page: "home" });
    }
    if (route.page === "home" && window.location.pathname !== "/") {
      window.history.replaceState({}, "", "/");
      setRoute({ page: "home" });
    }
  }, [route]);
  useEffect(() => { saveState(state); }, [state]);
  useEffect(() => { if (!loginOpen && loginFocus) loginFocus.focus(); }, [loginOpen, loginFocus]);
  useEffect(() => { if (!paywallOpen && paywallFocus) { paywallFocus.focus(); setPaywallFocus(null); } }, [paywallOpen, paywallFocus]);

  const update = (fn: (draft: DemoState) => void) => setState((current) => { const next = structuredClone(current); fn(next); saveState(next); return next; });
  const openLogin = (element?: HTMLElement) => { setLoginFocus(element && typeof element.focus === "function" ? element : null); setLoginOpen(true); };
  const signIn = () => { const intent = loginIntent; update((draft) => { draft.userId = "demo-user"; if (intent && intent !== "subscribe" && !draft.favorites.includes(intent.characterId)) draft.favorites.push(intent.characterId); }); setLoginOpen(false); setLoginIntent(null); if (intent === "subscribe") navigate(`/subscribe?returnTo=${encodeURIComponent(route.page === "chat" ? `/chat/${route.characterId}` : "/")}`); };
  const signOut = () => { update((draft) => { draft.userId = null; draft.drafts = {}; }); if (route.page !== "home") navigate("/"); };
  const toggleFavorite = (characterId: string, trigger?: HTMLElement) => {
    if (!state.userId) { setLoginIntent({ type: "favorite", characterId }); openLogin(trigger); return; }
    update((draft) => { draft.favorites = draft.favorites.includes(characterId) ? draft.favorites.filter((id) => id !== characterId) : [...draft.favorites, characterId]; });
  };

  const startSubscribe = () => {
    setPaywallOpen(false);
    if (state.userId && state.subscription.status === "active") { if (route.page !== "me") navigate("/me"); return; }
    if (!state.userId) { setLoginIntent("subscribe"); openLogin(); return; }
    navigate(`/subscribe?returnTo=${encodeURIComponent(route.page === "chat" ? `/chat/${route.characterId}` : "/")}`);
  };
  const completeDemoCheckout = (outcome: DemoBillingOutcome) => update((draft) => { applyDemoBillingOutcome(draft, outcome, nextBillingDate()); });
  const closePaywall = () => setPaywallOpen(false);
  const openPaywall = () => { setPaywallFocus(document.activeElement instanceof HTMLElement ? document.activeElement : null); setPaywallOpen(true); };

  return <div className="app-root">
    <div className="demo-banner"><span className="demo-dot" /> Demo · Simulated chat and billing</div>
    <AppShell route={route} state={state} onNavigate={navigate} onPremium={startSubscribe} onLogin={openLogin} onLogout={signOut} />
    <main className={`page-frame page-${route.page}`}>
      {route.page === "home" && <HomePage state={state} onPremium={startSubscribe} onLogin={openLogin} query={homeQuery} tag={homeTag} loading={homeLoading} onQuery={setHomeQuery} onTag={setHomeTag} onLoading={setHomeLoading} onOpenChat={(id) => { sessionStorage.setItem("yellow-home-scroll", String(window.scrollY)); navigate(`/chat/${id}`); }} />}
      {route.page === "chat" && route.characterId && <ChatPage characterId={route.characterId} state={state} update={update} onBack={() => navigate(route.returnTo ?? "/")} onLogin={openLogin} onPremium={startSubscribe} onPaywall={openPaywall} onFavorite={toggleFavorite} />}
      {route.page === "subscribe" && <SubscribePage state={state} demoPayment={route.demoPayment} onBack={() => navigate(route.returnTo ?? "/")} onCheckout={completeDemoCheckout} onLogin={openLogin} />}
      {route.page === "me" && <MePage state={state} onNavigate={navigate} onPremium={startSubscribe} onLogin={openLogin} onLogout={signOut} />}
    </main>
    <MobileNav route={route} onNavigate={navigate} />
    {loginOpen && <LoginModal onClose={() => { setLoginOpen(false); setLoginIntent(null); }} onSignIn={signIn} />}
    {paywallOpen && <PaywallModal character={route.characterId ? getCharacter(route.characterId) : undefined} onClose={closePaywall} onContinue={startSubscribe} />}
  </div>;
}

function AppShell({ route, state, onNavigate, onPremium, onLogin, onLogout }: { route: Route; state: DemoState; onNavigate: (to: string) => void; onPremium: () => void; onLogin: (element?: HTMLElement) => void; onLogout: () => void }) {
  const recentActive = route.page === "me" && window.location.hash === "#recent";
  const link = (active: boolean) => active ? "nav-item active" : "nav-item";
  const premiumActive = Boolean(state.userId && state.subscription.status === "active");
  return <aside className="app-sidebar">
    <div className="brand-lockup" title="Home" onClick={() => onNavigate("/")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate("/"); } }}><span className="brand-mark">Y</span><span>Yellow</span></div>
    <div className="sidebar-section-label">DISCOVER</div>
    <nav className="sidebar-nav">
      <button className={link(route.page === "home")} aria-current={route.page === "home" ? "page" : undefined} title="Home" onClick={() => onNavigate("/")}><Home size={18} /> Home</button>
      <button className={link(recentActive)} aria-current={recentActive ? "page" : undefined} title="Recent chats" onClick={() => onNavigate("/me#recent")}><MessageCircle size={18} /> Recent chats</button>
    </nav>
    <div className="sidebar-section-label">YOUR SPACE</div>
    <nav className="sidebar-nav"><button className={link(route.page === "me" && !recentActive)} aria-current={route.page === "me" && !recentActive ? "page" : undefined} title="My account" onClick={() => onNavigate("/me")}><UserRound size={18} /> My account</button></nav>
    <div className="sidebar-spacer" />
    <button className={`premium-sidebar ${premiumActive ? "is-active" : ""}`} title={premiumActive ? "Manage Premium" : "Upgrade to Premium"} aria-label={premiumActive ? "Manage Premium" : "Upgrade to Premium"} onClick={premiumActive ? () => onNavigate("/me") : onPremium}><Sparkles size={16} /><span><strong>{premiumActive ? "Premium active" : "Upgrade to Premium"}</strong><small>{premiumActive ? "Manage in My account" : "More replies, longer memory"}</small></span><ArrowRight size={15} /></button>
    {state.userId ? <button className="account-row" title="Sign out" aria-label="Sign out" onClick={onLogout}><span className="avatar avatar-small">Y</span><span><strong>Demo user</strong><small>Sign out</small></span><LogOut size={15} /></button> : <button className="account-row" title="Sign in to save your conversations" aria-label="Sign in to save your conversations" onClick={() => onLogin()}><span className="avatar avatar-small guest"><LogIn size={15} /></span><span><strong>Sign in</strong><small>Save your conversations</small></span><ArrowRight size={15} /></button>}
    <div className="sidebar-footnote">Fictional conversations only.<br />Be kind to the characters.</div>
  </aside>;
}

function MobileNav({ route, onNavigate }: { route: Route; onNavigate: (to: string) => void }) { if (route.page === "chat") return null; return <nav className="mobile-nav" aria-label="Primary navigation"><button className={route.page === "home" ? "active" : ""} aria-current={route.page === "home" ? "page" : undefined} onClick={() => onNavigate("/")}><Home size={20} /><span>Home</span></button><button className={route.page === "me" ? "active" : ""} aria-current={route.page === "me" ? "page" : undefined} onClick={() => onNavigate("/me")}><UserRound size={20} /><span>Me</span></button></nav>; }

function TopBar({ title, state, onPremium, onLogin, onBack, showPremium = true }: { title?: string; state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; onBack?: () => void; showPremium?: boolean }) { const premiumActive = Boolean(state.userId && state.subscription.status === "active"); return <header className="topbar">{onBack ? <button className="icon-button mobile-only" onClick={onBack} aria-label="Back"><ArrowLeft size={19} /></button> : <div className="topbar-title">{title}</div>}<div className="topbar-actions">{showPremium && <button className={`premium-button ${premiumActive ? "is-active" : ""}`} onClick={onPremium} aria-label={premiumActive ? "Manage Premium" : "Upgrade to Premium"} title={premiumActive ? "Manage Premium" : "Upgrade to Premium"}><Sparkles size={15} /> {premiumActive ? "Premium active" : "Premium"}</button>}{state.userId ? <span className="user-chip"><span className="avatar avatar-tiny">Y</span> Demo user</span> : <button className="sign-in-button" onClick={(event) => onLogin(event.currentTarget)}>Sign in</button>}</div></header>; }

function HomePage({ state, onPremium, onLogin, query, tag, loading, onQuery, onTag, onLoading, onOpenChat }: { state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; query: string; tag: string; loading: boolean; onQuery: (v: string) => void; onTag: (v: string) => void; onLoading: (v: boolean) => void; onOpenChat: (id: string) => void }) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200); return () => window.clearTimeout(timer); }, [query]);
  const filtered = useMemo(() => CHARACTERS.filter((character) => (!debouncedQuery || character.name.toLowerCase().includes(debouncedQuery)) && (tag === "All" || character.tags.includes(tag))), [debouncedQuery, tag]);
  useLayoutEffect(() => { const saved = sessionStorage.getItem("yellow-home-scroll"); if (saved) { window.scrollTo({ top: Number(saved), left: 0, behavior: "auto" }); sessionStorage.removeItem("yellow-home-scroll"); } }, []);
  const clearFilters = () => { onQuery(""); onTag("All"); };
  const closeFilters = () => { setFilterOpen(false); window.requestAnimationFrame(() => filterToggleRef.current?.focus()); };
  return <><TopBar title="Discover characters" state={state} onPremium={onPremium} onLogin={onLogin} /><div className="home-layout">
    <aside id="character-filters" className={`filter-panel ${filterOpen ? "open" : ""}`}><div className="filter-heading"><span><Menu size={16} /> Filters</span><div className="filter-heading-actions"><button onClick={clearFilters}>Reset</button><button className="filter-close" onClick={closeFilters} aria-label="Close filters"><X size={16} /></button></div></div><label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search characters" aria-label="Search characters" /></label><div className="filter-label">TAGS</div><div className="tag-filter">{TAGS.map((item) => <button key={item} className={tag === item ? "selected" : ""} aria-pressed={tag === item} onClick={() => onTag(item)}>{item}<span className="tag-radio" /></button>)}</div><div className="filter-note"><CircleHelp size={14} /> Search by name or choose one tag.</div></aside>
    <section className="home-content"><section className="hero-banner"><img src="/characters/luna.png" alt="Luna Vale" /><div className="hero-shade" /><div className="hero-copy"><div className="eyebrow"><Zap size={13} /> A quieter kind of connection</div><h1>Find someone<br /><em>worth staying up for.</em></h1><p>Original characters. Private conversations. Start with a hello.</p><button className="hero-cta" onClick={() => document.getElementById("character-grid")?.scrollIntoView({ behavior: "smooth" })}>Explore characters <ArrowRight size={16} /></button></div></section>
      <div className="toolbar"><div><h2>Characters</h2><p>{filtered.length} of {CHARACTERS.length} characters</p></div><button ref={filterToggleRef} className="filter-toggle" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="character-filters"><Menu size={16} /> Filters</button><span className="toolbar-hint">Pick a card to start chatting</span></div>
      <div id="character-grid" className="character-grid">{loading ? Array.from({ length: 10 }).map((_, index) => <div key={index} className="character-card skeleton-card" />) : filtered.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onOpenChat(character.id)} onImageError={() => onLoading(false)} />)}</div>
      {!loading && !filtered.length && <div className="empty-state"><Search size={28} /><h3>No characters found</h3><p>Try another name or clear the filter.</p><button className="secondary-button" onClick={clearFilters}>Clear filters</button></div>}
      <div className="content-disclaimer"><LockKeyhole size={14} /> Characters are fictional and conversations are private to your account.</div>
    </section>
  </div></>;
}

function CharacterCard({ character, onClick, onImageError }: { character: Character; onClick: () => void; onImageError: () => void }) { const [failed, setFailed] = useState(false); return <button className="character-card" onClick={onClick} aria-label={`Chat with ${character.name}`}><div className="card-image-wrap">{failed ? <div className="image-fallback"><span>{character.name.slice(0, 1)}</span><small>{character.name}</small></div> : <img src={character.image} alt="" style={{ objectPosition: character.objectPosition }} onError={() => { setFailed(true); onImageError(); }} />}</div><div className="card-body"><h3>{character.name}</h3><p>{character.tagline}</p><div className="card-tags">{character.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div></button>; }

function ChatPage({ characterId, state, update, onBack, onLogin, onPremium, onPaywall, onFavorite }: { characterId: string; state: DemoState; update: (fn: (draft: DemoState) => void) => void; onBack: () => void; onLogin: (element?: HTMLElement) => void; onPremium: () => void; onPaywall: () => void; onFavorite: (id: string, trigger?: HTMLElement) => void }) {
  const character = getCharacter(characterId) ?? CHARACTERS[0];
  const [input, setInput] = useState(state.drafts[character.id] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jumpVisible, setJumpVisible] = useState(false);
  const [retryAction, setRetryAction] = useState<{ mode: "send"; messageId: string; text: string } | { mode: "regenerate"; text: string } | null>(() => {
    const pendingText = state.conversations[character.id]?.pendingRegenerateText;
    return pendingText ? { mode: "regenerate", text: pendingText } : null;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const conversation = state.userId ? state.conversations[character.id] : undefined;
  const messages = conversation?.messages ?? [];
  const hasUnresolvedFailure = messages.some((message) => message.status === "failed") || retryAction?.mode === "regenerate";
  const remaining = state.userId ? quotaRemaining(state) : FREE_LIMIT;
  const isFavorite = Boolean(state.userId && state.favorites.includes(character.id));

  useEffect(() => { setInput(state.drafts[character.id] ?? ""); }, [character.id]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [character.id]);
  useEffect(() => { if (!jumpVisible) bottomRef.current?.scrollIntoView({ block: "end" }); }, [busy, jumpVisible, messages.length, messages[messages.length - 1]?.content]);
  useEffect(() => { const onScroll = () => setJumpVisible(document.documentElement.scrollHeight - window.scrollY - window.innerHeight > 160); window.addEventListener("scroll", onScroll); return () => window.removeEventListener("scroll", onScroll); }, []);
  const persistDraft = (value: string) => update((draft) => { if (value) draft.drafts[character.id] = value; else delete draft.drafts[character.id]; });
  const runGeneration = async (text: string, existingUserId?: string, regenerate = false, retrying = false) => {
    if (busyRef.current) return; busyRef.current = true; setError(""); setBusy(true); setRetryAction(null);
    if (!state.userId) { onLogin(composerRef.current ?? undefined); busyRef.current = false; setBusy(false); return; }
    if (quotaRemaining(state) <= 0 || state.usageReserved > 0) { onPaywall(); busyRef.current = false; setBusy(false); return; }
    update((draft) => { reserveReply(draft); });
    const userId = existingUserId ?? `user-${Date.now()}`;
    if (!regenerate && !existingUserId) update((draft) => { const current = draft.conversations[character.id] ?? makeConversation(character.id); current.messages.push({ id: userId, role: "user", content: text, status: "pending", createdAt: Date.now() }); current.updatedAt = Date.now(); draft.conversations[character.id] = current; delete draft.drafts[character.id]; });
    if (!regenerate && !existingUserId) setInput("");
    const response = buildReply(character, text, regenerate);
    const shouldFail = regenerate ? (!retrying && /\[regen-fail\]/i.test(text)) : (!existingUserId && /\[(?:fail|error)\]|simulate failure/i.test(text));
    const assistantId = `assistant-${Date.now()}`;
    if (!regenerate) update((draft) => { const current = draft.conversations[character.id]; if (current) current.messages.push({ id: assistantId, role: "assistant", content: "", status: "streaming", createdAt: Date.now() }); });
    try {
      if (shouldFail) throw new Error("PROVIDER_UNAVAILABLE");
      let streamed = "";
      await streamText(response, (delta) => { streamed += delta; if (!regenerate) update((draft) => { const current = draft.conversations[character.id]; const target = current?.messages.find((message) => message.id === assistantId); if (target) { target.content = streamed; target.status = "streaming"; } }); });
      update((draft) => { const current = draft.conversations[character.id] ?? makeConversation(character.id); if (regenerate) { const target = current.messages[current.messages.length - 1]; if (target?.role === "assistant") { const old = { id: target.activeVariantId ?? `${target.id}-v${target.variants?.length ?? 0}`, content: target.content, createdAt: target.createdAt }; target.variants = [...(target.variants ?? []), old]; target.activeVariantId = `${target.id}-v${target.variants.length}`; target.content = streamed; target.status = "saved"; delete current.pendingRegenerateText; current.contextRevision += 1; current.memory.contextRevision = current.contextRevision; } } else { const user = current.messages.find((message) => message.id === userId); const assistant = current.messages.find((message) => message.id === assistantId); if (user) user.status = "saved"; if (assistant) { assistant.status = "saved"; assistant.content = streamed; } current.memory = extractMemory(current, text); } current.updatedAt = Date.now(); commitReply(draft); draft.conversations[character.id] = current; });
      if (!regenerate && !existingUserId) setInput(""); setError(""); setRetryAction(null);
      if (remaining <= 1) onPaywall();
    } catch (generationError) {
      update((draft) => { releaseReply(draft); const current = draft.conversations[character.id]; if (current) { if (!regenerate) { current.messages = current.messages.filter((message) => message.id !== assistantId); const user = current.messages.find((message) => message.id === userId); if (user) user.status = "failed"; } else { current.pendingRegenerateText = text; } } });
      setError(generationError instanceof Error && generationError.message === "PROVIDER_UNAVAILABLE" ? "The simulated provider is unavailable. Your message is safe — try again." : "Couldn’t save this reply. Try again."); setRetryAction(regenerate ? { mode: "regenerate", text } : { mode: "send", messageId: userId, text });
    } finally { busyRef.current = false; setBusy(false); }
  };
  const retry = (action: { mode: "send"; messageId: string; text: string } | { mode: "regenerate"; text: string }) => action.mode === "regenerate" ? runGeneration(action.text, undefined, true, true) : runGeneration(action.text, action.messageId, false, true);
  const send = () => { if (hasUnresolvedFailure) { setError("Retry the unsent message above before sending another one."); return; } const text = input.trim(); if (!text) { setError("Write something first."); return; } if (text.length > 2000) { setError("Keep your message under 2,000 characters."); return; } runGeneration(text); };
  const regenerate = () => { const last = messages[messages.length - 1]; const before = messages[messages.length - 2]; if (!last || last.role !== "assistant" || last.status !== "saved" || !before || before.role !== "user") return; runGeneration(before.content, undefined, true); };
  return <div className="chat-page"><TopBar state={state} onPremium={onPremium} onLogin={onLogin} onBack={onBack} /><div className="chat-header"><button className="icon-button" onClick={onBack} aria-label="Back to characters"><ArrowLeft size={19} /></button><img src={character.image} alt="" /><div><strong>{character.name}</strong><span>Fictional conversation</span></div><button className={`favorite-button ${isFavorite ? "is-favorite" : ""}`} onClick={(event) => onFavorite(character.id, event.currentTarget)} aria-label={isFavorite ? "Remove favorite" : "Add favorite"}><Heart size={18} fill={isFavorite ? "currentColor" : "none"} /></button></div>
    <div className="chat-reading-column"><div className="chat-intro"><img src={character.image} alt="" /><h1>{character.name}</h1><p>{character.tagline}</p><p className="intro-greeting">{character.greeting}</p><div className="intro-tags">{character.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><small>AI character · Fictional conversation</small></div>
      <div className="message-list" aria-live="polite">{messages.map((message, index) => <MessageBlock key={message.id} message={message} isLast={index === messages.length - 1} onRegenerate={regenerate} onRetry={(failedMessage) => retry({ mode: "send", messageId: failedMessage.id, text: failedMessage.content })} busy={busy} />)}{(error || retryAction?.mode === "regenerate") && <div className="chat-error"><CircleHelp size={16} /><span>{error || "The failed regenerate is ready to retry."}</span>{retryAction && <button onClick={() => retry(retryAction)}>Retry</button>}</div>}{busy && <div className="typing-row"><span className="avatar avatar-small">{character.name.slice(0, 1)}</span><span className="typing-dots"><i /><i /><i /></span><span>Writing…</span></div>}<div ref={bottomRef} /></div>
      {jumpVisible && <button className="jump-latest" onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}>Jump to latest <ChevronDown size={15} /></button>}
      <div className="composer-area"><div className={`quota-line ${remaining <= 3 ? "quota-warning" : ""}`}><span>{state.userId && state.subscription.status === "active" ? `${remaining} replies left this billing period` : `${remaining} free replies left`}</span>{remaining <= 3 && <button onClick={onPremium}>Get more replies</button>}</div>{hasUnresolvedFailure && <div className="composer-blocked-note"><CircleHelp size={14} /> {retryAction?.mode === "regenerate" ? "Retry the failed regenerate above before sending a new one." : "Retry the unsent message above before sending a new one."}</div>}<div className="composer"><textarea ref={composerRef} value={input} maxLength={2000} placeholder={state.userId ? "Write a message…" : "Sign in to start chatting…"} onChange={(event) => { setInput(event.target.value); persistDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent as KeyboardEvent).isComposing) { event.preventDefault(); send(); } }} aria-label="Message" /><button className="send-button" onClick={send} disabled={busy || hasUnresolvedFailure} aria-label="Send message"><Send size={18} /></button></div><div className="composer-meta"><span>Enter to send · Shift + Enter for a new line</span><span>{input.length}/2,000</span></div></div>
    </div></div>;
}

function MessageBlock({ message, isLast, onRegenerate, onRetry, busy }: { message: ChatMessage; isLast: boolean; onRegenerate: () => void; onRetry: (message: ChatMessage) => void; busy: boolean }) { if (message.status === "failed") return <div className="message-block user-message failed-message"><div className="message-meta"><span className="avatar avatar-small">Y</span><strong>You</strong><span className="status-failed">Not sent</span></div><div className="message-content">{message.content}</div><button className="regenerate-button" onClick={() => onRetry(message)} disabled={busy}><RotateCcw size={14} /> Retry</button></div>; return <div className={`message-block ${message.role === "user" ? "user-message" : "assistant-message"}`}><div className="message-meta"><span className={`avatar avatar-small ${message.role === "assistant" ? "character-avatar" : ""}`}>{message.role === "assistant" ? <Sparkles size={12} /> : "Y"}</span><strong>{message.role === "assistant" ? "Character" : "You"}</strong>{message.status === "saved" && <span className="saved-state"><Check size={13} /> Saved</span>}</div><div className="message-content">{message.content || <span className="inline-writing">Writing…</span>}</div>{message.role === "assistant" && isLast && message.status === "saved" && <button className="regenerate-button" onClick={onRegenerate} disabled={busy}><RotateCcw size={14} /> Regenerate</button>}</div>; }

function SubscribePage({ state, demoPayment, onBack, onCheckout, onLogin }: { state: DemoState; demoPayment?: DemoPaymentMode; onBack: () => void; onCheckout: (outcome: "success" | "failed" | "canceled" | "pending") => void; onLogin: () => void }) {
  const active = Boolean(state.userId && state.subscription.status === "active");
  const initialStatus = state.subscription.status === "pending" || state.subscription.status === "failed" || state.subscription.status === "canceled" ? state.subscription.status : "idle";
  const [checkoutStatus, setCheckoutStatus] = useState<"idle" | "creating" | "verifying" | "active" | "failed" | "canceled" | "pending">(initialStatus);
  const [simulatedOnce, setSimulatedOnce] = useState(false);
  const busy = checkoutStatus === "creating" || checkoutStatus === "verifying";
  const beginCheckout = async () => {
    if (busy || active) return;
    setCheckoutStatus("creating");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    if (demoPayment && !simulatedOnce) {
      setSimulatedOnce(true);
      setCheckoutStatus(demoPayment);
      onCheckout(demoPayment);
      return;
    }
    setCheckoutStatus("verifying");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    onCheckout("success");
    setCheckoutStatus("active");
  };
  const statusCopy = checkoutStatus === "creating" ? "Preparing the demo checkout…" : checkoutStatus === "verifying" ? "Verifying demo payment…" : checkoutStatus === "failed" ? "Demo payment failed. No Premium access was granted." : checkoutStatus === "canceled" ? "Demo checkout was canceled. No Premium access was granted." : checkoutStatus === "pending" ? "Payment is still being verified. Access stays locked until confirmation." : "";
  const actionLabel = active ? "Continue chatting" : checkoutStatus === "pending" ? "Refresh payment status" : checkoutStatus === "failed" || checkoutStatus === "canceled" ? "Try checkout again" : state.userId ? "Continue to secure checkout" : "Sign in to continue";
  const action = active ? onBack : state.userId ? beginCheckout : onLogin;
  return <div className="subscribe-page"><TopBar title="Premium" state={state} onPremium={() => undefined} onLogin={onLogin} onBack={onBack} showPremium={false} /><div className="subscribe-wrap"><div className="subscribe-kicker"><Sparkles size={16} /> Keep the conversation going</div><h1>More room for<br /><em>the stories you start.</em></h1><p className="subscribe-lede">One simple plan for longer conversations with the characters you return to.</p><div className="subscription-card"><div className="plan-top"><div><span className="plan-label">YELLOW PREMIUM</span><h2>{PLAN.price}<small> / month</small></h2></div><span className="plan-badge">ONE PLAN</span></div><div className="plan-divider" /><ul><li><Check size={17} /> 1,000 replies per billing month</li><li><Check size={17} /> Regenerate included in your reply count</li><li><Check size={17} /> Longer memory for ongoing stories</li><li><Check size={17} /> Renews monthly until canceled</li><li><Check size={17} /> Cancel anytime; access stays until period end</li></ul><button className="checkout-button" onClick={action} disabled={busy}>{actionLabel}<ArrowRight size={17} /></button>{statusCopy && <div className={`checkout-status ${checkoutStatus === "failed" || checkoutStatus === "canceled" ? "is-error" : checkoutStatus === "pending" ? "is-pending" : ""}`} role="status">{statusCopy}</div>}<p className="checkout-note">Billed monthly. Final amount and any taxes are shown by the secure checkout. Demo checkout is simulated locally.</p></div>{active && <div className="active-confirmation"><Check size={16} /> Active through {state.subscription.periodEnd}. Verified by the demo billing adapter.</div>}<div className="billing-status"><Clock3 size={15} />{active ? "Manage subscription in your account." : "Your chat history stays readable if you decide not to subscribe."}</div></div></div>;
}

function subscriptionStatusLabel(status: DemoState["subscription"]["status"]) { return status === "active" ? "Active" : status === "pending" ? "Pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Canceled" : "Free"; }
function subscriptionPlanName(status: DemoState["subscription"]["status"]) { return status === "active" ? "Yellow Premium" : status === "pending" ? "Payment pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Checkout canceled" : "Free plan"; }
function subscriptionPlanDetail(state: DemoState) { const status = state.subscription.status; return status === "active" ? `${quotaRemaining(state)} of ${PLAN.replies} replies left · through ${state.subscription.periodEnd}` : status === "pending" ? "Premium stays locked until payment is confirmed" : status === "failed" ? "No Premium access was granted · try checkout again" : status === "canceled" ? "No charge was made · try checkout again when ready" : `${quotaUsed(state)} of ${quotaLimit(state)} free replies used`; }
function subscriptionActionLabel(status: DemoState["subscription"]["status"]) { return status === "pending" ? "Refresh payment status" : status === "failed" || status === "canceled" ? "Try checkout again" : `Upgrade for ${PLAN.price}`; }

function MePage({ state, onNavigate, onPremium, onLogin, onLogout }: { state: DemoState; onNavigate: (to: string) => void; onPremium: () => void; onLogin: () => void; onLogout: () => void }) { const conversations = Object.values(state.conversations).filter((conversation) => getCharacter(conversation.characterId)).sort((a, b) => b.updatedAt - a.updatedAt); const favoriteCharacters = state.favorites.map(getCharacter).filter(Boolean) as Character[]; return <div className="me-page"><TopBar title="My account" state={state} onPremium={onPremium} onLogin={onLogin} /><div className="me-wrap"><div className="me-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>My account</h1><p>Keep your favorite characters close and your conversations in reach.</p></div>{state.userId && <button className="secondary-button" onClick={onLogout}><LogOut size={15} /> Sign out</button>}</div>{!state.userId ? <div className="account-empty"><div className="empty-icon"><LockKeyhole size={22} /></div><h2>Sign in to save your space</h2><p>Your chats, favorites, and subscription status will follow your account.</p><button className="primary-button" onClick={onLogin}><LogIn size={16} /> Sign in</button></div> : <><section id="recent" className="me-section"><div className="section-title"><div><span className="eyebrow">RECENT</span><h2>Recent conversations</h2></div><span>{conversations.length}</span></div>{conversations.length ? <div className="recent-list">{conversations.map((conversation) => { const character = getCharacter(conversation.characterId); if (!character) return null; const latest = [...conversation.messages].reverse().find((message) => message.status === "saved" || message.status === "failed"); const preview = latest?.status === "failed" ? "Unsent · retry to continue" : latest?.content ?? "Ready when you are."; return <button className="recent-row" key={conversation.id} onClick={() => onNavigate(`/chat/${character.id}?returnTo=${encodeURIComponent("/me#recent")}`)}><img src={character.image} alt="" /><span><strong>{character.name}</strong><small>{preview}</small></span><time>{formatRelative(conversation.updatedAt)}</time><ArrowRight size={16} /></button>; })}</div> : <EmptyLink copy="No conversations yet" action="Explore characters" onClick={() => onNavigate("/")} />}</section><section className="me-section"><div className="section-title"><div><span className="eyebrow">SAVED</span><h2>Favorite characters</h2></div><span>{favoriteCharacters.length}</span></div>{favoriteCharacters.length ? <div className="favorite-grid">{favoriteCharacters.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onNavigate(`/chat/${character.id}`)} onImageError={() => undefined} />)}</div> : <EmptyLink copy="No favorites yet" action="Explore characters" onClick={() => onNavigate("/")} />}</section><section className="me-section subscription-section"><div className="section-title"><div><span className="eyebrow">BILLING</span><h2>Subscription</h2></div><span className={`status-pill ${state.subscription.status}`}>{subscriptionStatusLabel(state.subscription.status)}</span></div><div className="account-plan"><div><strong>{subscriptionPlanName(state.subscription.status)}</strong><p>{subscriptionPlanDetail(state)}</p></div>{state.subscription.status === "active" ? <ManageSubscriptionButton /> : <button className="primary-button" onClick={onPremium}>{subscriptionActionLabel(state.subscription.status)}</button>}</div></section></>}</div></div>; }
function ManageSubscriptionButton() { const [message, setMessage] = useState(""); return <div className="manage-billing"><button className="secondary-button" onClick={() => setMessage("Demo billing portal is simulated locally; no changes were made.")}>Manage subscription</button>{message && <span className="billing-demo-note" role="status">{message}</span>}</div>; }
function EmptyLink({ copy, action, onClick }: { copy: string; action: string; onClick: () => void }) { return <div className="empty-row"><span>{copy}</span><button onClick={onClick}>{action} <ArrowRight size={15} /></button></div>; }
function nextBillingDate() { const date = new Date(); date.setMonth(date.getMonth() + 1); const pad = (value: number) => String(value).padStart(2, "0"); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
function formatRelative(timestamp: number) { const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000)); return minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.round(minutes / 60)}h ago` : `${Math.round(minutes / 1440)}d ago`; }

function trapDialogTab(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== "Tab") return;
  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex=\"-1\"])")).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

function LoginModal({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) { const ref = useRef<HTMLButtonElement>(null); useEffect(() => { ref.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description" onKeyDown={trapDialogTab}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">Y</span><h2 id="login-title">Keep your place</h2><p id="login-description">Sign in to save conversations, favorites, and your remaining replies.</p><button ref={ref} className="primary-button full" onClick={onSignIn}><LogIn size={16} /> Continue as Demo user</button><small className="modal-demo-note">Demo mode · no account or credentials are sent anywhere.</small></div></div>; }
function PaywallModal({ character, onClose, onContinue }: { character?: Character; onClose: () => void; onContinue: () => void }) { const closeRef = useRef<HTMLButtonElement>(null); useEffect(() => { closeRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywall-title" aria-describedby="paywall-description" onKeyDown={trapDialogTab}><button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>{character && <img className="paywall-avatar" src={character.image} alt="" />}<span className="eyebrow">FREE REPLIES USED</span><h2 id="paywall-title">Keep the conversation going</h2><p id="paywall-description">You can keep reading this chat. Upgrade when you’re ready for 1,000 replies per billing month and longer memory.</p><div className="paywall-plan"><strong>{PLAN.price}<small> / month</small></strong><span>1,000 replies · {PLAN.memory}</span></div><button className="checkout-button full" onClick={onContinue}>Continue to Premium <ArrowRight size={17} /></button><button className="text-button" onClick={onClose}>Maybe later</button></div></div>; }
