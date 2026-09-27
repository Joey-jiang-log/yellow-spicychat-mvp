import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Heart, Home, ListVideo, LockKeyhole, LogIn, LogOut, Menu, MessageCircle, MoreHorizontal, Music2, Phone, RotateCcw, Search, Send, Sparkles, TicketPercent, UserRound, Users, Video, X, Zap, UserRoundPlus } from "lucide-react";
import { CHARACTERS, getCharacter, getCharacterProfilePhotos, TAGS, type Character } from "./data";
import { applyDemoBillingOutcome, commitReply, DEMO_MODE, emptyState, extractMemory, FREE_LIMIT, hasCorruptStateBackup, loadState, makeConversation, orderChatSessions, PLAN, quotaLimit, quotaRemaining, quotaUsed, recoverInterruptedGeneration, releaseReply, reserveReply, saveState, streamText, normalizeState, type ChatMessage, type Conversation, type DemoBillingOutcome, type DemoState } from "./domain";
import { assetUrl, listConversations, listPublicCharacters, regenerateChat, sendChat } from "./api";
import AdminApp from "./AdminApp";
import CreateCharacterPage from "./CreateCharacterPage";
import PricingPage from "./PricingPage";
import "./chat-replica.css";
import "./accessibility.css";
import "./brand-atmosphere.css";

type DemoPaymentMode = "failed" | "canceled" | "pending";
type Route = { page: "home" | "chat" | "subscribe" | "pricing" | "create" | "recent" | "me" | "admin"; characterId?: string; returnTo?: string; demoPayment?: DemoPaymentMode };
const safeReturnTo = (value: string | null) => {
  if (value === "/" || value === "/discover") return "/discover";
  if (value === "/me" || value === "/me#recent" || value === "/account" || value === "/account#recent" || value === "/recent") return value;
  const match = value?.match(/^\/chat\/([^/]+)$/);
  return match ? `/chat/${match[1]}` : "/";
};
const parseRoute = (): Route => {
  const path = window.location.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) return { page: "admin" };
  const chatMatch = path.match(/^\/chat\/([^/]+)$/);
  if (chatMatch) return { page: "chat", characterId: chatMatch[1], returnTo: safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) };
  if (path.startsWith("/chat/")) return { page: "chat" };
  if (/^\/(?:subscribe|pricing)\/?$/.test(path)) {
    const params = new URLSearchParams(window.location.search);
    return { page: "pricing", returnTo: safeReturnTo(params.get("returnTo")) };
  }
  if (/^\/create\/?$/.test(path)) return { page: "create" };
  if (/^\/recent\/?$/.test(path)) return { page: "recent" };
  if (/^\/(?:me|account)\/?$/.test(path)) return window.location.hash === "#recent" ? { page: "recent" } : { page: "me" };
  if (/^\/(?:discover)?\/?$/.test(path)) return { page: "home" };
  return { page: "home" };
};

const navigate = (to: string) => { window.history.pushState({}, "", to); window.dispatchEvent(new PopStateEvent("popstate")); };
const subscriptionReturnPath = (route: Route) => route.page === "chat" ? `/chat/${route.characterId}` : route.page === "me" ? "/account" : route.page === "recent" ? "/recent" : "/discover";

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [state, setState] = useState<DemoState>(() => loadState(false));
  const [storageWarning, setStorageWarning] = useState(() => hasCorruptStateBackup() ? "Saved data was invalid; the original contents were backed up in this browser." : "");
  const [loginOpen, setLoginOpen] = useState(false);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [loginFocus, setLoginFocus] = useState<HTMLElement | null>(null);
  const [paywallFocus, setPaywallFocus] = useState<HTMLElement | null>(null);
  const [loginIntent, setLoginIntent] = useState<"subscribe" | { type: "favorite"; characterId: string } | null>(null);
  const [homeQuery, setHomeQuery] = useState("");
  const [homeTag, setHomeTag] = useState("All");
  const [homeLoading, setHomeLoading] = useState(false);
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS);
  const [charactersLoaded, setCharactersLoaded] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"loading" | "connected" | "offline">("loading");
  const allCharacters = useMemo(() => [...state.customCharacters, ...characters.filter((base) => !state.customCharacters.some((custom) => custom.id === base.id))], [state.customCharacters, characters]);
  const discoverCharacters = useMemo(() => allCharacters.filter((character) => character.visibility !== "private"), [allCharacters]);

  useEffect(() => { const onPop = () => setRoute(parseRoute()); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => {
    let mounted = true;
    const reconcileInterruptedWork = () => {
      const latest = recoverInterruptedGeneration(loadState(false));
      if (!saveState(latest)) setStorageWarning("This browser could not save changes. Free up storage space before continuing.");
      if (mounted) setState(latest);
    };
    // A startup on another tab must wait for an active generation before
    // recovering its reservation, otherwise it could release a live reply.
    if (navigator.locks?.request) void navigator.locks.request("yellow-demo-generation", { mode: "exclusive" }, reconcileInterruptedWork).catch(() => undefined);
    else reconcileInterruptedWork();
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const syncOtherTab = (event: StorageEvent) => {
      if (event.key !== "yellow-demo-state-v1" || !event.newValue) return;
      try { setState(normalizeState(JSON.parse(event.newValue))); } catch { /* Keep the last renderable state if another tab writes invalid data. */ }
    };
    window.addEventListener("storage", syncOtherTab);
    return () => window.removeEventListener("storage", syncOtherTab);
  }, []);
  useEffect(() => { listPublicCharacters().then((next) => { setCharacters(next); setBackendStatus("connected"); }).catch(() => setBackendStatus("offline")).finally(() => setCharactersLoaded(true)); }, []);
  useEffect(() => {
    if (!state.userId) return;
    listConversations(state.userId).then((serverConversations) => {
      if (!serverConversations.length) return;
      const next = loadState(false);
      serverConversations.forEach((serverConversation) => {
        const existing = next.conversations[serverConversation.characterId] ?? makeConversation(serverConversation.characterId);
        existing.id = serverConversation.id;
        existing.updatedAt = Date.parse(serverConversation.updatedAt) || Date.now();
        existing.messages = serverConversation.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, status: "saved", createdAt: Date.parse(message.createdAt) || Date.now(), imageUrl: message.imageUrl || null }));
        next.conversations[serverConversation.characterId] = existing;
      });
      if (!saveState(next)) setStorageWarning("This browser could not save changes. Free up storage space before continuing.");
      setState(next);
    }).catch(() => undefined);
  }, [state.userId]);
  useEffect(() => {
    if (route.page === "chat" && charactersLoaded && (!route.characterId || !allCharacters.some((character) => character.id === route.characterId))) {
      window.history.replaceState({}, "", "/discover");
      setRoute({ page: "home" });
    }
    if (route.page === "home" && window.location.pathname !== "/discover") {
      window.history.replaceState({}, "", "/discover");
    }
  }, [route, allCharacters, charactersLoaded]);
  useEffect(() => { if (!loginOpen && loginFocus) loginFocus.focus(); }, [loginOpen, loginFocus]);
  useEffect(() => { if (!paywallOpen && paywallFocus) { paywallFocus.focus(); setPaywallFocus(null); } }, [paywallOpen, paywallFocus]);

  const update = (fn: (draft: DemoState) => void) => {
    // Rebase each write on the latest persisted snapshot. Generation itself is
    // held under a cross-tab Web Lock; this also avoids stale-tab overwrites.
    const next = loadState(false);
    fn(next);
    if (!saveState(next)) setStorageWarning("This browser could not save changes. Free up storage space before continuing.");
    else if (!hasCorruptStateBackup()) setStorageWarning("");
    setState(next);
  };
  const openLogin = (element?: HTMLElement) => { setLoginFocus(element && typeof element.focus === "function" ? element : null); setLoginOpen(true); };
  const signIn = () => { const intent = loginIntent; update((draft) => { draft.userId = "demo-user"; if (intent && intent !== "subscribe" && !draft.favorites.includes(intent.characterId)) draft.favorites.push(intent.characterId); }); setLoginOpen(false); setLoginIntent(null); if (intent === "subscribe") navigate(`/pricing?returnTo=${encodeURIComponent(subscriptionReturnPath(route))}`); };
  const signOut = () => { update((draft) => { draft.userId = null; draft.drafts = {}; }); if (route.page !== "home") navigate("/"); };
  const toggleFavorite = (characterId: string, trigger?: HTMLElement) => {
    if (!state.userId) { setLoginIntent({ type: "favorite", characterId }); openLogin(trigger); return; }
    update((draft) => { draft.favorites = draft.favorites.includes(characterId) ? draft.favorites.filter((id) => id !== characterId) : [...draft.favorites, characterId]; });
  };

  const startSubscribe = () => {
    setPaywallOpen(false);
    navigate(`/pricing?returnTo=${encodeURIComponent(subscriptionReturnPath(route))}`);
  };
  const completeDemoCheckout = (outcome: DemoBillingOutcome) => update((draft) => { applyDemoBillingOutcome(draft, outcome, nextBillingDate()); });
  const closePaywall = () => setPaywallOpen(false);
  const openPaywall = () => { setPaywallFocus(document.activeElement instanceof HTMLElement ? document.activeElement : null); setPaywallOpen(true); };

  const isAdmin = route.page === "admin";
  const addCharacter = (character: Character) => {
    update((draft) => { character.createdBy = draft.userId ?? "local"; draft.customCharacters = [character, ...draft.customCharacters.filter((item) => item.id !== character.id)]; });
    navigate("/discover");
  };
  return <div className={`app-root ${isAdmin ? "app-admin-root" : ""}`}>
    {!isAdmin && <div className={`demo-banner backend-${backendStatus}`}><span className="demo-dot" /> Demo · Billing simulated <span className="backend-connection">{backendStatus === "connected" ? "· API connected" : backendStatus === "offline" ? "· API offline" : "· Connecting API…"}</span></div>}
    {!isAdmin && storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}
    {!isAdmin && <AppShell route={route} state={state} onNavigate={navigate} />}
    <main className={`page-frame page-${route.page}`}>
      {isAdmin && <AdminApp />}
      {route.page === "home" && <HomePage characters={discoverCharacters} state={state} onPremium={startSubscribe} onLogin={openLogin} query={homeQuery} tag={homeTag} loading={homeLoading} onQuery={setHomeQuery} onTag={setHomeTag} onLoading={setHomeLoading} onOpenChat={(id) => { sessionStorage.setItem("yellow-home-scroll", String(window.scrollY)); navigate(`/chat/${id}`); }} />}
      {route.page === "chat" && route.characterId && <ChatPage key={route.characterId} characters={allCharacters} characterId={route.characterId} state={state} update={update} onBack={() => navigate(route.returnTo ?? "/discover")} onLogin={openLogin} onPremium={startSubscribe} onPaywall={openPaywall} onFavorite={toggleFavorite} onOpenCharacter={(id) => navigate(`/chat/${id}`)} />}
      {route.page === "subscribe" && <SubscribePage state={state} demoPayment={route.demoPayment} onBack={() => navigate(route.returnTo ?? "/")} onCheckout={completeDemoCheckout} onLogin={openLogin} />}
      {route.page === "pricing" && <><TopBar title="Pricing" state={state} onPremium={startSubscribe} onLogin={openLogin} onBack={() => navigate(route.returnTo ?? "/discover")} showPremium={false} /><PricingPage onBack={() => navigate(route.returnTo ?? "/discover")} /></>}
      {route.page === "create" && <><TopBar title="Create character" state={state} onPremium={startSubscribe} onLogin={openLogin} onBack={() => navigate("/discover")} /><CreateCharacterPage onCreate={addCharacter} /></>}
      {route.page === "recent" && <RecentChatsPage state={state} characters={allCharacters} onNavigate={navigate} onPremium={startSubscribe} onLogin={openLogin} />}
      {route.page === "me" && <MePage state={state} characters={allCharacters} onNavigate={navigate} onPremium={startSubscribe} onLogin={openLogin} onLogout={signOut} />}
    </main>
    {!isAdmin && <MobileNav route={route} onNavigate={navigate} />}
    {!isAdmin && loginOpen && <LoginModal onClose={() => { setLoginOpen(false); setLoginIntent(null); }} onSignIn={signIn} />}
    {!isAdmin && paywallOpen && <PaywallModal character={route.characterId ? characters.find((character) => character.id === route.characterId) ?? getCharacter(route.characterId) : undefined} onClose={closePaywall} onContinue={startSubscribe} />}
  </div>;
}

function AppShell({ route, state, onNavigate }: { route: Route; state: DemoState; onNavigate: (to: string) => void }) {
  const recentActive = route.page === "recent" || route.page === "chat";
  const link = (active: boolean) => active ? "nav-item active" : "nav-item";
  const premiumActive = Boolean(state.userId && state.subscription.status === "active");
  return <aside className="app-sidebar">
    <div className="brand-lockup" title="Lureva home" onClick={() => onNavigate("/")} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onNavigate("/"); } }}><span className="brand-mark">L</span><span className="brand-word"><span>Lure</span><em>va</em></span></div>
    <div className="sidebar-section-label">DISCOVER</div>
    <nav className="sidebar-nav">
      <button className={link(route.page === "home")} aria-current={route.page === "home" ? "page" : undefined} title="Discover" onClick={() => onNavigate("/discover")}><Home size={18} /> Discover</button>
      <button className={link(route.page === "create")} aria-current={route.page === "create" ? "page" : undefined} title="Create character" onClick={() => onNavigate("/create")}><UserRoundPlus size={18} /> Create character</button>
      <button className={link(recentActive)} aria-current={recentActive ? "page" : undefined} title="Recent chats" onClick={() => onNavigate("/recent")}><MessageCircle size={18} /> Recent chats</button>
    </nav>
    <div className="sidebar-section-label">YOUR SPACE</div>
    <nav className="sidebar-nav">
      <button className={link(route.page === "pricing" || route.page === "subscribe")} aria-current={route.page === "pricing" || route.page === "subscribe" ? "page" : undefined} title="Pricing & credits" onClick={() => onNavigate("/pricing")}><TicketPercent size={18} /> Pricing & credits</button>
    </nav>
    <div className="sidebar-spacer" />
    <button className={`premium-sidebar ${premiumActive ? "is-active" : ""}`} title="View plans and credits" aria-label="View plans and credits" onClick={() => onNavigate("/pricing")}><Sparkles size={16} /><span><strong>{premiumActive ? "Premium active · view plans" : "Upgrade to Premium"}</strong><small>Compare plans & buy credits</small></span><ArrowRight size={15} /></button>
    <button className={`account-avatar-button ${route.page === "me" ? "active" : ""}`} title="My account and settings" aria-label="My account and settings" onClick={() => onNavigate("/account")}><span className={`avatar avatar-small ${state.userId ? "" : "guest"}`}>{state.userId ? "D" : <UserRound size={15} />}</span></button>
    <div className="sidebar-footnote">Fictional conversations only.<br />Be kind to the characters.</div>
  </aside>;
}

function MobileNav({ route, onNavigate }: { route: Route; onNavigate: (to: string) => void }) { if (route.page === "chat") return null; return <nav className="mobile-nav" aria-label="Primary navigation"><button className={route.page === "home" ? "active" : ""} aria-current={route.page === "home" ? "page" : undefined} onClick={() => onNavigate("/discover")}><Home size={20} /><span>Discover</span></button><button className={route.page === "create" ? "active" : ""} aria-current={route.page === "create" ? "page" : undefined} onClick={() => onNavigate("/create")}><UserRoundPlus size={20} /><span>Create</span></button><button className={route.page === "recent" ? "active" : ""} aria-current={route.page === "recent" ? "page" : undefined} onClick={() => onNavigate("/recent")}><MessageCircle size={20} /><span>Chats</span></button><button className={route.page === "pricing" || route.page === "subscribe" ? "active" : ""} aria-current={route.page === "pricing" || route.page === "subscribe" ? "page" : undefined} onClick={() => onNavigate("/pricing")}><TicketPercent size={20} /><span>Plans</span></button><button className={route.page === "me" ? "active" : ""} aria-current={route.page === "me" ? "page" : undefined} onClick={() => onNavigate("/account")}><UserRound size={20} /><span>Me</span></button></nav>; }

function TopBar({ title, state, onPremium, onLogin, onBack, showPremium = true }: { title?: string; state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; onBack?: () => void; showPremium?: boolean }) { const premiumActive = Boolean(state.userId && state.subscription.status === "active"); return <header className="topbar">{onBack ? <button className="icon-button mobile-only" onClick={onBack} aria-label="Back"><ArrowLeft size={19} /></button> : <div className="topbar-title">{title}</div>}<div className="topbar-actions">{showPremium && <button className={`premium-button ${premiumActive ? "is-active" : ""}`} onClick={onPremium} aria-label="View plans and upgrades" title="View plans and upgrades"><Sparkles size={15} /> {premiumActive ? "Plans & upgrades" : "Premium"}</button>}{state.userId ? <span className="user-chip"><span className="avatar avatar-tiny">D</span> Demo user</span> : <button className="sign-in-button" onClick={(event) => onLogin(event.currentTarget)}>Sign in</button>}</div></header>; }

function HomePage({ characters, state, onPremium, onLogin, query, tag, loading, onQuery, onTag, onLoading, onOpenChat }: { characters: Character[]; state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; query: string; tag: string; loading: boolean; onQuery: (v: string) => void; onTag: (v: string) => void; onLoading: (v: boolean) => void; onOpenChat: (id: string) => void }) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200); return () => window.clearTimeout(timer); }, [query]);
  const filtered = useMemo(() => characters.filter((character) => (!debouncedQuery || character.name.toLowerCase().includes(debouncedQuery)) && (tag === "All" || character.tags.includes(tag))), [characters, debouncedQuery, tag]);
  useLayoutEffect(() => { const saved = sessionStorage.getItem("yellow-home-scroll"); if (saved) { window.scrollTo({ top: Number(saved), left: 0, behavior: "auto" }); sessionStorage.removeItem("yellow-home-scroll"); } }, []);
  const clearFilters = () => { onQuery(""); onTag("All"); };
  const closeFilters = () => { setFilterOpen(false); window.requestAnimationFrame(() => filterToggleRef.current?.focus()); };
  return <><TopBar title="Discover characters" state={state} onPremium={onPremium} onLogin={onLogin} /><div className="home-layout">
    <aside id="character-filters" className={`filter-panel ${filterOpen ? "open" : ""}`}><div className="filter-heading"><span><Menu size={16} /> Filters</span><div className="filter-heading-actions"><button onClick={clearFilters}>Reset</button><button className="filter-close" onClick={closeFilters} aria-label="Close filters"><X size={16} /></button></div></div><label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search characters" aria-label="Search characters" /></label><div className="filter-label">TAGS</div><div className="tag-filter">{TAGS.map((item) => <button key={item} className={tag === item ? "selected" : ""} aria-pressed={tag === item} onClick={() => onTag(item)}>{item}<span className="tag-radio" /></button>)}</div><div className="filter-note"><CircleHelp size={14} /> Search by name or choose one tag.</div></aside>
    <section className="home-content"><section className="hero-banner"><img src={characters[0]?.coverImage || characters[0]?.image || "/characters/luna.png"} alt={characters[0]?.name || "Lureva characters"} /><div className="hero-shade" /><div className="hero-copy"><div className="eyebrow"><Zap size={13} /> A quieter kind of connection</div><h1>Find someone<br /><em>worth staying up for.</em></h1><p>Original characters. One-on-one chats. Start with a hello.</p><button className="hero-cta" onClick={() => document.getElementById("character-grid")?.scrollIntoView({ behavior: "smooth" })}>Explore characters <ArrowRight size={16} /></button></div></section>
      <div className="toolbar"><div><h2>Characters</h2><p>{filtered.length} of {characters.length} characters</p></div><button ref={filterToggleRef} className="filter-toggle" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="character-filters"><Menu size={16} /> Filters</button><span className="toolbar-hint">Pick a card to start chatting</span></div>
      <div id="character-grid" className="character-grid">{loading ? Array.from({ length: 10 }).map((_, index) => <div key={index} className="character-card skeleton-card" />) : filtered.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onOpenChat(character.id)} onImageError={() => onLoading(false)} />)}</div>
      {!loading && !filtered.length && <div className="empty-state"><Search size={28} /><h3>No characters found</h3><p>Try another name or clear the filter.</p><button className="secondary-button" onClick={clearFilters}>Clear filters</button></div>}
      <div className="content-disclaimer"><LockKeyhole size={14} /> Shared demo · Chats may be processed by the configured AI provider. Avoid sensitive information.</div>
    </section>
  </div></>;
}

function CharacterCard({ character, onClick, onImageError }: { character: Character; onClick: () => void; onImageError: () => void }) { const [failed, setFailed] = useState(false); const image = character.coverImage || character.image; return <button className="character-card" onClick={onClick} aria-label={`Chat with ${character.name}`}><div className="card-image-wrap">{failed ? <div className="image-fallback"><span>{character.name.slice(0, 1)}</span><small>{character.name}</small></div> : <img src={image} alt="" style={{ objectPosition: character.objectPosition }} onError={() => { setFailed(true); onImageError(); }} />}</div><div className="card-body"><h3>{character.name}</h3><p>{character.tagline}</p><div className="card-tags">{character.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div></button>; }

function ChatPage({ characters, characterId, state, update, onBack, onLogin, onPremium, onPaywall, onFavorite, onOpenCharacter }: { characters: Character[]; characterId: string; state: DemoState; update: (fn: (draft: DemoState) => void) => void; onBack: () => void; onLogin: (element?: HTMLElement) => void; onPremium: () => void; onPaywall: () => void; onFavorite: (id: string, trigger?: HTMLElement) => void; onOpenCharacter: (id: string) => void }) {
  const character = characters.find((item) => item.id === characterId) ?? getCharacter(characterId) ?? CHARACTERS[0];
  const draftSessionId = useRef("");
  if (!draftSessionId.current) {
    draftSessionId.current = window.sessionStorage.getItem("yellow-draft-session") ?? `tab-${crypto.randomUUID()}`;
    window.sessionStorage.setItem("yellow-draft-session", draftSessionId.current);
  }
  const draftKey = `${character.id}:${draftSessionId.current}`;
  const [input, setInput] = useState(state.drafts[draftKey] ?? state.drafts[character.id] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jumpVisible, setJumpVisible] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [profilePhotoIndex, setProfilePhotoIndex] = useState(0);
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
  const profilePhotos = getCharacterProfilePhotos(character);
  const sessionCharacters = orderChatSessions(characters, state.conversations, character.id, sessionQuery);

  useEffect(() => { setInput(state.drafts[draftKey] ?? state.drafts[character.id] ?? ""); }, [character.id, draftKey]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [character.id]);
  useEffect(() => { if (!jumpVisible) bottomRef.current?.scrollIntoView({ block: "end" }); }, [busy, jumpVisible, messages.length, messages[messages.length - 1]?.content]);
  const persistDraft = (value: string) => update((draft) => { if (value) draft.drafts[draftKey] = value; else delete draft.drafts[draftKey]; });
  const runGeneration = async (text: string, existingUserId?: string, regenerate = false) => {
    if (busyRef.current) return; busyRef.current = true; setError(""); setBusy(true); setRetryAction(null);
    const runWithLatestState = async () => {
    const latest = loadState(false);
    if (!latest.userId) { onLogin(composerRef.current ?? undefined); return; }
    if (latest.usageReserved > 0) { setError("A reply is already being written in another chat. Please try again when it finishes."); return; }
    if (quotaRemaining(latest) <= 0) { onPaywall(); return; }
    update((draft) => { reserveReply(draft); });
    const userId = existingUserId ?? `user-${Date.now()}`;
    if (!regenerate && !existingUserId) update((draft) => { const previous = draft.conversations[character.id]; const current = previous ?? makeConversation(character.id); if (!previous) current.updatedAt = 0; current.messages.push({ id: userId, role: "user", content: text, status: "pending", createdAt: Date.now() }); draft.conversations[character.id] = current; delete draft.drafts[draftKey]; delete draft.drafts[character.id]; });
    if (!regenerate && !existingUserId) setInput("");
    let response = "";
    let serverConversationId: string | undefined;
    let serverImageUrl: string | null = null;
    const assistantId = `assistant-${Date.now()}`;
    if (!regenerate) update((draft) => { const current = draft.conversations[character.id]; if (current) current.messages.push({ id: assistantId, role: "assistant", content: "", status: "streaming", createdAt: Date.now() }); });
    try {
      const inlineCharacter = character.id.startsWith("custom-") ? { name: character.name, greeting: character.greeting, persona: character.persona, scenario: character.scenario, exampleDialogues: character.exampleDialogues } : undefined;
      const serverResponse = regenerate
        ? await regenerateChat(character.id, conversation?.id || "", latest.userId, inlineCharacter)
        : await sendChat(character.id, text, conversation?.id, latest.userId, inlineCharacter);
      response = serverResponse.message;
      serverConversationId = serverResponse.conversationId;
      serverImageUrl = serverResponse.image?.imageUrl || null;
      let streamed = "";
      await streamText(response, (delta) => { streamed += delta; if (!regenerate) update((draft) => { const current = draft.conversations[character.id]; const target = current?.messages.find((message) => message.id === assistantId); if (target) { target.content = streamed; target.status = "streaming"; } }); });
      update((draft) => { const current = draft.conversations[character.id] ?? makeConversation(character.id); if (serverConversationId) current.id = serverConversationId; if (regenerate) { const target = current.messages[current.messages.length - 1]; if (target?.role === "assistant") { const old = { id: target.activeVariantId ?? `${target.id}-v${target.variants?.length ?? 0}`, content: target.content, createdAt: target.createdAt }; target.variants = [...(target.variants ?? []), old]; target.activeVariantId = `${target.id}-v${target.variants.length}`; target.content = streamed; target.status = "saved"; delete current.pendingRegenerateText; current.contextRevision += 1; current.memory.contextRevision = current.contextRevision; } } else { const user = current.messages.find((message) => message.id === userId); const assistant = current.messages.find((message) => message.id === assistantId); if (user) user.status = "saved"; if (assistant) { assistant.status = "saved"; assistant.content = streamed; assistant.imageUrl = serverImageUrl; } current.memory = extractMemory(current, text); } current.updatedAt = Date.now(); commitReply(draft); draft.conversations[character.id] = current; });
      if (!regenerate && !existingUserId) setInput(""); setError(""); setRetryAction(null);
      if (quotaRemaining(loadState(false)) <= 1) onPaywall();
    } catch (generationError) {
      update((draft) => { releaseReply(draft); const current = draft.conversations[character.id]; if (current) { if (!regenerate) { current.messages = current.messages.filter((message) => message.id !== assistantId); const user = current.messages.find((message) => message.id === userId); if (user) user.status = "failed"; } else { current.pendingRegenerateText = text; } } });
      const failureMessage = generationError instanceof TypeError
          ? "Lureva’s conversation service is unavailable. Start or restart the local service, then retry."
          : generationError instanceof Error
            ? generationError.message
            : "Couldn’t save this reply. Try again.";
      setError(failureMessage); setRetryAction(regenerate ? { mode: "regenerate", text } : { mode: "send", messageId: userId, text });
    }
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request("yellow-demo-generation", { mode: "exclusive" }, runWithLatestState);
      else await runWithLatestState();
    } catch {
      setError("Couldn’t start the reply safely. Please try again.");
    } finally { busyRef.current = false; setBusy(false); }
  };
  const retry = (action: { mode: "send"; messageId: string; text: string } | { mode: "regenerate"; text: string }) => action.mode === "regenerate" ? runGeneration(action.text, undefined, true) : runGeneration(action.text, action.messageId);
  const send = () => { if (hasUnresolvedFailure) { setError("Retry the unsent message above before sending another one."); return; } const text = input.trim(); if (!text) { setError("Write something first."); return; } if (text.length > 2000) { setError("Keep your message under 2,000 characters."); return; } runGeneration(text); };
  const regenerate = () => { const last = messages[messages.length - 1]; const before = messages[messages.length - 2]; if (!last || last.role !== "assistant" || last.status !== "saved" || !before || before.role !== "user") return; runGeneration(before.content, undefined, true); };
  return <div className="chat-page">
    <header className="chat-global-header"><div className="chat-brand"><span className="chat-menu-symbol" aria-hidden="true"><Menu size={25} /></span><button className="chat-brand-name" onClick={onBack}><span className="chat-brand-mark">L</span><span>Lure</span><span className="chat-brand-accent">va</span></button></div><div className="chat-global-actions"><span className="chat-demo-chip">DEEPSEEK V4.1 FLASH</span><button className={`chat-premium-cta ${state.subscription.status === "active" ? "is-active" : ""}`} onClick={onPremium}><TicketPercent size={17} /> {state.subscription.status === "active" ? "Plans & upgrades" : "优质的 七折优惠"}</button>{state.userId ? <button className="chat-user-avatar" title="My account and settings" onClick={() => navigate("/account")}>D<span /></button> : <button className="chat-user-avatar guest" title="Sign in" onClick={() => onLogin()}> <UserRound size={18} /><span /></button>}</div></header>
    <div className="chat-workspace">
      <aside className="chat-sessions"><div className="sessions-heading"><h1>聊天</h1><button title="Groups — not available in this demo" disabled><Users size={19} /><span>新集团</span></button></div><label className="sessions-search"><Search size={19} /><input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="搜索个人资料……" aria-label="搜索个人资料" /></label><div className="sessions-list">{sessionCharacters.map((person) => { const thread = state.conversations[person.id]; const latest = thread?.messages[thread.messages.length - 1]; const previewText = latest?.content ?? (person.id === character.id ? "准备好开始聊天" : ""); return <button className={`session-row ${person.id === character.id ? "active" : ""}`} key={person.id} onClick={() => person.id !== character.id && onOpenCharacter(person.id)}><img src={person.image} alt="" /><span className="session-copy"><strong>{person.name}</strong><small>{previewText}</small></span><time>{thread ? new Date(thread.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : person.id === character.id ? "新对话" : ""}</time></button>; })}{sessionCharacters.length === 0 && <div className="sessions-empty">没有找到会话</div>}</div></aside>
      <section className="chat-main"><header className="chat-conversation-header"><button className="chat-back" onClick={onBack} aria-label="返回"><ArrowLeft size={20} /></button><img src={character.image} alt="" /><div className="chat-heading-copy"><strong>{character.name} <BadgeCheck size={18} fill="#f1378f" strokeWidth={2.5} /></strong><span><i /> 在线的</span></div><div className="chat-action-buttons"><button aria-label="Video unavailable" title="视频 · 演示版暂不可用" disabled><Video size={24} fill="currentColor" /></button><button aria-label="Call unavailable" title="通话 · 演示版暂不可用" disabled><Phone size={23} fill="currentColor" /></button><button aria-label="More unavailable" title="更多操作 · 演示版暂不可用" disabled><MoreHorizontal size={25} /></button><button aria-label="Settings unavailable" title="会话设置 · 演示版暂不可用" disabled><ListVideo size={25} /></button><button className={`chat-favorite ${isFavorite ? "is-favorite" : ""}`} onClick={(event) => onFavorite(character.id, event.currentTarget)} aria-label={isFavorite ? "Remove favorite" : "Add favorite"}><Heart size={20} fill={isFavorite ? "currentColor" : "none"} /></button></div></header>
        <div className="chat-conversation-body">
          <div className="chat-transcript" onScroll={(event) => setJumpVisible(event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight > 160)} aria-live="polite">
            <div className="chat-bubbles">
              {messages.length === 0
                ? <div className="chat-bubble-row from-character"><div className="chat-bubble"><p>{character.greeting}</p><footer><time>现在</time></footer></div></div>
                : messages.map((message, index) => <div className={`chat-bubble-row ${message.role === "user" ? "from-user" : "from-character"}`} key={message.id}>
                    <div className={`chat-bubble ${message.status === "failed" ? "failed" : ""}`}>
                      <p>{message.content || (message.status === "streaming" ? "正在输入……" : "")}</p>
                      {message.imageUrl && <img className="chat-bubble-image" src={assetUrl(message.imageUrl)} alt={message.imageTitle || "Character image"} />}
                      <footer><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{message.role === "user" && message.status === "saved" && <CheckCheck size={16} />}</footer>
                      {message.status === "failed" && <button className="chat-retry" onClick={() => retry({ mode: "send", messageId: message.id, text: message.content })} disabled={busy}><RotateCcw size={14} /> Retry</button>}
                      {message.role === "assistant" && index === messages.length - 1 && message.status === "saved" && <button className="chat-regenerate" onClick={regenerate} disabled={busy}><RotateCcw size={13} /> Regenerate</button>}
                    </div>
                  </div>)}
            </div>
            {(error || retryAction?.mode === "regenerate") && <div className="chat-error"><CircleHelp size={16} /><span>{error || "The failed regenerate is ready to retry."}</span>{retryAction?.mode === "regenerate" && <button onClick={() => { if (retryAction?.mode === "regenerate") retry(retryAction); }}>Retry</button>}</div>}
            {busy && <div className="chat-typing"><span className="typing-dots"><i /><i /><i /></span><span>{character.name}正在输入……</span></div>}
            <div ref={bottomRef} />
          </div>
          {jumpVisible && <button className="jump-latest" onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}>Jump to latest <ChevronDown size={15} /></button>}
          <div className="chat-composer-area"><div className={`quota-line ${remaining <= 3 ? "quota-warning" : ""}`}><span>{state.userId && state.subscription.status === "active" ? `${remaining} replies left this billing period` : `${remaining} free replies left`}</span>{remaining <= 3 && <button onClick={onPremium}>Get more replies</button>}</div>{hasUnresolvedFailure && <div className="composer-blocked-note"><CircleHelp size={14} /> {retryAction?.mode === "regenerate" ? "Retry the failed regenerate above before sending a new one." : "Retry the unsent message above before sending a new one."}</div>}<div className="chat-composer"><textarea ref={composerRef} value={input} maxLength={2000} placeholder={state.userId ? "写条消息……" : "登录后开始聊天……"} onChange={(event) => { setInput(event.target.value); persistDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent as KeyboardEvent).isComposing) { event.preventDefault(); send(); } }} aria-label="Message" /><button className="chat-send-button" onClick={send} disabled={busy || state.usageReserved > 0 || hasUnresolvedFailure} aria-label="发送消息"><Send size={19} fill="currentColor" /></button></div><div className="chat-composer-meta"><span>Enter 发送 · Shift + Enter 换行</span><span>{input.length}/2,000</span></div></div>
        </div>
      </section>
      <aside className="chat-profile"><div className="profile-photo-area"><img className="profile-photo" src={profilePhotos[profilePhotoIndex]} alt={character.name} /><button className="profile-photo-nav previous" aria-label="上一张角色照片" onClick={() => setProfilePhotoIndex((index) => (index + profilePhotos.length - 1) % profilePhotos.length)}><ChevronLeft size={23} /></button><button className="profile-photo-nav next" aria-label="下一张角色照片" onClick={() => setProfilePhotoIndex((index) => (index + 1) % profilePhotos.length)}><ChevronRight size={23} /></button><div className="profile-photo-dots">{profilePhotos.map((photo, index) => <button key={`${index}-${photo}`} className={index === profilePhotoIndex ? "active" : ""} aria-label={`角色照片 ${index + 1}`} onClick={() => setProfilePhotoIndex(index)} />)}</div></div><div className="profile-overview"><h2>{character.name}</h2><p>{character.persona}</p><div className="profile-socials"><button aria-label="Instagram unavailable" title="社交链接暂未配置" disabled><Camera size={19} /></button><button aria-label="TikTok unavailable" title="社交链接暂未配置" disabled><Music2 size={18} /></button></div></div><section className="profile-about"><h3>关于我：</h3><div className="profile-facts"><div><span className="fact-icon">AGE</span><span><small>年龄</small><strong>27</strong></span></div><div><span className="fact-icon"><Heart size={18} /></span><span><small>兴趣</small><strong>{character.tags[1] ?? "聊天"}</strong></span></div></div><div className="profile-tags">{character.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section><div className="profile-actions"><button className={isFavorite ? "is-favorite" : ""} onClick={(event) => onFavorite(character.id, event.currentTarget)}><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /> {isFavorite ? "已收藏" : "收藏角色"}</button><button onClick={() => navigate("/me")}><UserRound size={16} /> 我的空间</button></div></aside>
    </div>
  </div>;
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
  return <div className="subscribe-page"><TopBar title="Premium" state={state} onPremium={() => undefined} onLogin={onLogin} onBack={onBack} showPremium={false} /><div className="subscribe-wrap"><div className="subscribe-kicker"><Sparkles size={16} /> Keep the conversation going</div><h1>More room for<br /><em>the stories you start.</em></h1><p className="subscribe-lede">One simple plan for longer conversations with the characters you return to.</p><div className="subscription-card"><div className="plan-top"><div><span className="plan-label">LUREVA PREMIUM</span><h2>{PLAN.price}<small> / month</small></h2></div><span className="plan-badge">ONE PLAN</span></div><div className="plan-divider" /><ul><li><Check size={17} /> 1,000 replies per billing month</li><li><Check size={17} /> Regenerate included in your reply count</li><li><Check size={17} /> Longer memory for ongoing stories</li><li><Check size={17} /> Renews monthly until canceled</li><li><Check size={17} /> Cancel anytime; access stays until period end</li></ul><button className="checkout-button" onClick={action} disabled={busy}>{actionLabel}<ArrowRight size={17} /></button>{statusCopy && <div className={`checkout-status ${checkoutStatus === "failed" || checkoutStatus === "canceled" ? "is-error" : checkoutStatus === "pending" ? "is-pending" : ""}`} role="status">{statusCopy}</div>}<p className="checkout-note">Billed monthly. Final amount and any taxes are shown by the secure checkout. Demo checkout is simulated locally.</p></div>{active && <div className="active-confirmation"><Check size={16} /> Active through {state.subscription.periodEnd}. Verified by the demo billing adapter.</div>}<div className="billing-status"><Clock3 size={15} />{active ? "Manage subscription in your account." : "Your chat history stays readable if you decide not to subscribe."}</div></div></div>;
}

function subscriptionStatusLabel(status: DemoState["subscription"]["status"]) { return status === "active" ? "Active" : status === "pending" ? "Pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Canceled" : "Free"; }
function subscriptionPlanName(status: DemoState["subscription"]["status"]) { return status === "active" ? "Lureva Premium" : status === "pending" ? "Payment pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Checkout canceled" : "Free plan"; }
function subscriptionPlanDetail(state: DemoState) { const status = state.subscription.status; return status === "active" ? `${quotaRemaining(state)} of ${PLAN.replies} replies left · through ${state.subscription.periodEnd}` : status === "pending" ? "Premium stays locked until payment is confirmed" : status === "failed" ? "No Premium access was granted · try checkout again" : status === "canceled" ? "No charge was made · try checkout again when ready" : `${quotaUsed(state)} of ${quotaLimit(state)} free replies used`; }
function subscriptionActionLabel(_status: DemoState["subscription"]["status"]) { return "View plans & upgrades"; }

function RecentChatsPage({ state, characters, onNavigate, onPremium, onLogin }: { state: DemoState; characters: Character[]; onNavigate: (to: string) => void; onPremium: () => void; onLogin: () => void }) {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const conversations = Object.values(state.conversations)
    .filter((conversation) => characterById.has(conversation.characterId))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return <div className="me-page recent-page">
    <TopBar title="Recent chats" state={state} onPremium={onPremium} onLogin={onLogin} />
    <div className="me-wrap">
      <div className="me-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>Recent chats</h1><p>Pick up where your conversations left off.</p></div></div>
      <section className="me-section">
        <div className="section-title"><div><span className="eyebrow">CONVERSATIONS</span><h2>Your chats</h2></div><span>{conversations.length}</span></div>
        {conversations.length ? <div className="recent-list">{conversations.map((conversation) => {
          const character = characterById.get(conversation.characterId);
          if (!character) return null;
          const latest = [...conversation.messages].reverse().find((message) => message.status === "saved" || message.status === "failed");
          const preview = latest?.status === "failed" ? "Unsent · retry to continue" : latest?.content ?? "Ready when you are.";
          return <button className="recent-row" key={conversation.id} onClick={() => onNavigate(`/chat/${character.id}?returnTo=${encodeURIComponent("/recent")}`)}><img src={character.image} alt="" /><span><strong>{character.name}</strong><small>{preview}</small></span><time>{formatRelative(conversation.updatedAt)}</time><ArrowRight size={16} /></button>;
        })}</div> : <EmptyLink copy="No conversations yet" action="Explore characters" onClick={() => onNavigate("/discover")} />}
      </section>
    </div>
  </div>;
}

function MePage({ state, characters, onNavigate, onPremium, onLogin, onLogout }: { state: DemoState; characters: Character[]; onNavigate: (to: string) => void; onPremium: () => void; onLogin: () => void; onLogout: () => void }) {
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const favoriteCharacters = state.favorites.map((id) => characterById.get(id)).filter((character): character is Character => Boolean(character));
  return <div className="me-page">
    <TopBar title="My account" state={state} onPremium={onPremium} onLogin={onLogin} />
    <div className="me-wrap">
      <div className="me-heading"><div><span className="eyebrow">ACCOUNT SETTINGS</span><h1>My account</h1><p>Manage your profile, subscription, created characters, and favorites.</p></div>{state.userId && <button className="secondary-button" onClick={onLogout}><LogOut size={15} /> Sign out</button>}</div>
      <section className="me-section account-settings-section">
        <div className="section-title"><div><span className="eyebrow">PROFILE</span><h2>Account settings</h2></div><span>{state.userId ? "Demo account" : "Guest"}</span></div>
        <div className="account-settings-grid"><div><small>Signed in as</small><strong>{state.userId ? "Demo user" : "Guest"}</strong><p>Demo sign-in only; no real account is connected.</p></div><div><small>Data & privacy</small><strong>Shared demo storage</strong><p>Chats are saved by the local API and may be sent to its configured AI provider. Do not enter private or sensitive information.</p></div></div>
      </section>
      <section className="me-section subscription-section">
        <div className="section-title"><div><span className="eyebrow">BILLING</span><h2>Subscription</h2></div><span className={`status-pill ${state.subscription.status}`}>{subscriptionStatusLabel(state.subscription.status)}</span></div>
        <div className="account-plan"><div><strong>{subscriptionPlanName(state.subscription.status)}</strong><p>{subscriptionPlanDetail(state)}</p></div><button className="primary-button" onClick={onPremium}>{state.subscription.status === "active" ? "View plans & upgrades" : subscriptionActionLabel(state.subscription.status)}</button></div>
      </section>
      <section className="me-section">
        <div className="section-title"><div><span className="eyebrow">CREATED HERE</span><h2>Your characters</h2></div><span>{state.customCharacters.length}</span></div>
        {state.customCharacters.length ? <div className="favorite-grid">{state.customCharacters.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onNavigate(`/chat/${character.id}`)} onImageError={() => undefined} />)}</div> : <EmptyLink copy="No characters created yet" action="Create a character" onClick={() => onNavigate("/create")} />}
      </section>
      {!state.userId ? <div className="account-empty"><div className="empty-icon"><LockKeyhole size={22} /></div><h2>Continue in the demo</h2><p>Real accounts and private cross-device sync are not connected.</p><button className="primary-button" onClick={onLogin}><LogIn size={16} /> Continue</button></div> : <section className="me-section">
        <div className="section-title"><div><span className="eyebrow">SAVED</span><h2>Favorite characters</h2></div><span>{favoriteCharacters.length}</span></div>
        {favoriteCharacters.length ? <div className="favorite-grid">{favoriteCharacters.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onNavigate(`/chat/${character.id}`)} onImageError={() => undefined} />)}</div> : <EmptyLink copy="No favorites yet" action="Explore characters" onClick={() => onNavigate("/discover")} />}
      </section>}
    </div>
  </div>;
}
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

function LoginModal({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) { const ref = useRef<HTMLButtonElement>(null); useEffect(() => { ref.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description" onKeyDown={trapDialogTab}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">L</span><h2 id="login-title">Keep your place</h2><p id="login-description">Continue with a shared demo profile. Chats are saved by this demo and may be sent to its configured AI provider; avoid sensitive information.</p><button ref={ref} className="primary-button full" onClick={onSignIn}><LogIn size={16} /> Continue as Demo user</button><small className="modal-demo-note">No real account is created.</small></div></div>; }
function PaywallModal({ character, onClose, onContinue }: { character?: Character; onClose: () => void; onContinue: () => void }) { const closeRef = useRef<HTMLButtonElement>(null); useEffect(() => { closeRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywall-title" aria-describedby="paywall-description" onKeyDown={trapDialogTab}><button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>{character && <img className="paywall-avatar" src={character.image} alt="" />}<span className="eyebrow">FREE REPLIES USED</span><h2 id="paywall-title">Keep the conversation going</h2><p id="paywall-description">You can keep reading this chat. Upgrade when you’re ready for 1,000 replies per billing month and longer memory.</p><div className="paywall-plan"><strong>{PLAN.price}<small> / month</small></strong><span>1,000 replies · {PLAN.memory}</span></div><button className="checkout-button full" onClick={onContinue}>Continue to Premium <ArrowRight size={17} /></button><button className="text-button" onClick={onClose}>Maybe later</button></div></div>; }
