import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SyntheticEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, CheckCheck, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Heart, Home, ListVideo, LockKeyhole, LogIn, LogOut, Menu, MessageCircle, MoreHorizontal, Music2, Phone, RotateCcw, Search, Send, Sparkles, Square, TicketPercent, UserRound, Users, Video, X, Zap, UserRoundPlus } from "lucide-react";
import { CHARACTERS, getCharacter, getCharacterProfilePhotos, TAGS, type Character } from "./data";
import { applyDemoBillingOutcome, commitReply, DEMO_MODE, emptyState, extractMemory, FREE_LIMIT, hasCorruptStateBackup, loadState, makeConversation, matchesCharacterSearch, orderChatSessions, PLAN, quotaLimit, quotaRemaining, quotaUsed, readSessionValue, removeSessionValue, recoverInterruptedGeneration, releaseReply, reserveReply, saveState, shouldHydrateServerConversation, shouldOpenPaywall, writeSessionValue, normalizeState, type ChatMessage, type Conversation, type DemoBillingOutcome, type DemoState } from "./domain";
import { assetUrl, characterCardImageSrcSet, getBrowserSession, getServiceHealth, isLiveChatConfigured, listConversations, listPublicCharacters, regenerateChatStream, sendChatStream, type ChatResponse } from "./api";
import { getPlanPrice, plans } from "./pricing-data";
import AdminApp from "./AdminApp";
import CreateCharacterPage from "./CreateCharacterPage";
import PricingPage from "./PricingPage";
import "./chat-replica.css";
import "./accessibility.css";
import "./brand-atmosphere.css";
import "./experience-polish.css";

type DemoPaymentMode = "failed" | "canceled" | "pending";
type Route = { page: "home" | "chat" | "subscribe" | "pricing" | "create" | "recent" | "me" | "admin"; characterId?: string; returnTo?: string; demoPayment?: DemoPaymentMode };
const CHARACTER_IMAGE_FALLBACK = "/characters/optimized/luna-900-v1.jpg";
const localBrowserSessionId = () => {
  const key = "lureva-local-browser-session";
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const created = `local_${window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    window.localStorage.setItem(key, created);
    return created;
  } catch {
    return `local_${window.crypto?.randomUUID?.() || Date.now()}`;
  }
};
const recoverCharacterImage = (event: SyntheticEvent<HTMLDivElement>) => {
  if (!(event.target instanceof HTMLImageElement)) return;
  const image = event.target;
  if (!image.closest(".hero-banner, .profile-photo-area, .chat-sessions, .chat-conversation-header, .recent-list, .paywall-modal")) return;
  if (image.src.endsWith(CHARACTER_IMAGE_FALLBACK)) image.hidden = true;
  else image.src = CHARACTER_IMAGE_FALLBACK;
};
const safeReturnTo = (value: string | null) => {
  if (value === "/" || value === "/discover") return "/discover";
  if (value === "/me" || value === "/me#recent" || value === "/account" || value === "/account#recent" || value === "/recent") return value;
  const match = value?.match(/^\/chat\/([^/]+)$/);
  return match ? `/chat/${match[1]}` : "/";
};
const parseRoute = (): Route => {
  const path = window.location.pathname;
  if (path === "/admin" || path.startsWith("/admin/")) return { page: "admin" };
  const chatMatch = path.match(/^\/chat\/([^/]+)\/?$/);
  if (chatMatch) return { page: "chat", characterId: chatMatch[1], returnTo: safeReturnTo(new URLSearchParams(window.location.search).get("returnTo")) };
  if (path.startsWith("/chat/")) return { page: "home" };
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
  const [homeLoading, setHomeLoading] = useState(true);
  const [characters, setCharacters] = useState<Character[]>(CHARACTERS);
  const [charactersLoaded, setCharactersLoaded] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"loading" | "connected" | "offline">("loading");
  const [chatServiceStatus, setChatServiceStatus] = useState<"checking" | "configured" | "simulated">("checking");
  const [browserSessionId, setBrowserSessionId] = useState<string | null>(null);
  const allCharacters = useMemo(() => [...state.customCharacters, ...characters.filter((base) => !state.customCharacters.some((custom) => custom.id === base.id))], [state.customCharacters, characters]);
  const discoverCharacters = useMemo(() => allCharacters.filter((character) => character.visibility !== "private"), [allCharacters]);

  useEffect(() => { const onPop = () => setRoute(parseRoute()); window.addEventListener("popstate", onPop); return () => window.removeEventListener("popstate", onPop); }, []);
  useEffect(() => {
    let mounted = true;
    getBrowserSession().then((session) => {
      if (!mounted) return;
      setBrowserSessionId(session.id);
      const latest = loadState(false);
      // Migrate the old shared demo label to this browser's server-signed session.
      // The server never accepts this client-side ID as proof of identity.
      if (latest.userId && latest.userId !== session.id) {
        latest.userId = session.id;
        if (saveState(latest)) setState(latest);
      }
    }).catch(() => { if (mounted) setBrowserSessionId(null); });
    return () => { mounted = false; };
  }, []);
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
  useEffect(() => { listPublicCharacters().then((next) => { setCharacters(next); setBackendStatus("connected"); }).catch(() => setBackendStatus("offline")).finally(() => { setHomeLoading(false); setCharactersLoaded(true); }); }, []);
  useEffect(() => {
    let mounted = true;
    getServiceHealth().then((health) => {
      if (mounted) setChatServiceStatus(isLiveChatConfigured(health) ? "configured" : "simulated");
    }).catch(() => { if (mounted) setChatServiceStatus("simulated"); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const userId = state.userId;
    if (!userId) return;
    let current = true;
    listConversations(userId).then((serverConversations) => {
      if (!current || !serverConversations.length) return;
      const next = loadState(false);
      let changed = false;
      serverConversations.forEach((serverConversation) => {
        const existing = next.conversations[serverConversation.characterId];
        const serverUpdatedAt = Date.parse(serverConversation.updatedAt);
        if (!shouldHydrateServerConversation(existing, serverUpdatedAt)) return;
        const conversation = existing ?? makeConversation(serverConversation.characterId);
        conversation.id = serverConversation.id;
        conversation.updatedAt = serverUpdatedAt;
        conversation.messages = serverConversation.messages.map((message) => ({ id: message.id, role: message.role, content: message.content, status: "saved", createdAt: Date.parse(message.createdAt) || Date.now(), imageUrl: message.imageUrl || null, imageTitle: message.imageTitle || null, ...(message.sceneId ? { sceneId: message.sceneId } : {}) }));
        next.conversations[serverConversation.characterId] = conversation;
        changed = true;
      });
      if (!changed) return;
      if (!saveState(next)) setStorageWarning("This browser could not save changes. Free up storage space before continuing.");
      setState(next);
    }).catch(() => undefined);
    return () => { current = false; };
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
  const signIn = async () => {
    const intent = loginIntent;
    let sessionId = browserSessionId;
    if (!sessionId) {
      try { sessionId = (await getBrowserSession()).id; setBrowserSessionId(sessionId); }
      catch { sessionId = localBrowserSessionId(); }
    }
    update((draft) => { draft.userId = sessionId; if (intent && intent !== "subscribe" && !draft.favorites.includes(intent.characterId)) draft.favorites.push(intent.characterId); });
    setLoginOpen(false);
    setLoginIntent(null);
    if (intent === "subscribe") navigate(`/pricing?returnTo=${encodeURIComponent(subscriptionReturnPath(route))}`);
  };
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
    const next = loadState(false);
    const created = { ...character, createdBy: next.userId ?? "local" };
    next.customCharacters = [created, ...next.customCharacters.filter((item) => item.id !== created.id)];
    if (!saveState(next)) {
      setStorageWarning("Could not save this character in this browser. Try a smaller image or remove older local demo data.");
      return false;
    }
    setState(next);
    if (!hasCorruptStateBackup()) setStorageWarning("");
    navigate("/discover");
    return true;
  };
  return <div className={`app-root ${isAdmin ? "app-admin-root" : ""}`} onErrorCapture={recoverCharacterImage}>
    {!isAdmin && <div className={`demo-banner backend-${backendStatus}`}><span className="demo-dot" /> Demo · Billing simulated <span className="backend-connection">{backendStatus === "connected" ? "· Data service connected" : backendStatus === "offline" ? "· Demo catalog offline" : "· Connecting data service…"}</span></div>}
    {!isAdmin && storageWarning && <div className="storage-warning" role="status">{storageWarning}</div>}
    {!isAdmin && <AppShell route={route} state={state} onNavigate={navigate} />}
    <main className={`page-frame page-${route.page}`}>
      {isAdmin && <AdminApp />}
      {route.page === "home" && <HomePage characters={discoverCharacters} allCharacters={allCharacters} state={state} onPremium={startSubscribe} onLogin={openLogin} query={homeQuery} tag={homeTag} loading={homeLoading} onQuery={setHomeQuery} onTag={setHomeTag} onRetryCatalog={() => { setHomeLoading(true); listPublicCharacters().then((next) => { setCharacters(next); setBackendStatus("connected"); }).catch(() => setBackendStatus("offline")).finally(() => setHomeLoading(false)); }} onOpenChat={(id) => { writeSessionValue("yellow-home-scroll", String(window.scrollY)); navigate(`/chat/${id}`); }} />}
      {route.page === "chat" && route.characterId && <ChatPage key={route.characterId} characters={allCharacters} characterId={route.characterId} state={state} update={update} simulatedMode={chatServiceStatus !== "configured"} chatServiceStatus={chatServiceStatus} onBack={() => navigate(route.returnTo ?? "/discover")} onLogin={openLogin} onPremium={startSubscribe} onPaywall={openPaywall} onFavorite={toggleFavorite} onOpenCharacter={(id) => navigate(`/chat/${id}`)} />}
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
    <button className={`premium-sidebar ${premiumActive ? "is-active" : ""}`} title="View plans and credits" aria-label="View plans and credits" onClick={() => onNavigate("/pricing")}><Sparkles size={16} /><span><strong>{premiumActive ? "Demo Premium · view plans" : "Upgrade to Premium"}</strong><small>Compare plans & buy credits</small></span><ArrowRight size={15} /></button>
    <button className={`account-avatar-button ${route.page === "me" ? "active" : ""}`} title="My account and settings" aria-label="My account and settings" onClick={() => onNavigate("/account")}><span className={`avatar avatar-small ${state.userId ? "" : "guest"}`}>{state.userId ? "D" : <UserRound size={15} />}</span></button>
    <div className="sidebar-footnote">Fictional conversations only.<br />Be kind to the characters.</div>
  </aside>;
}

function MobileNav({ route, onNavigate }: { route: Route; onNavigate: (to: string) => void }) { if (route.page === "chat") return null; return <nav className="mobile-nav" aria-label="Primary navigation"><button className={route.page === "home" ? "active" : ""} aria-current={route.page === "home" ? "page" : undefined} onClick={() => onNavigate("/discover")}><Home size={20} /><span>Discover</span></button><button className={route.page === "create" ? "active" : ""} aria-current={route.page === "create" ? "page" : undefined} onClick={() => onNavigate("/create")}><UserRoundPlus size={20} /><span>Create</span></button><button className={route.page === "recent" ? "active" : ""} aria-current={route.page === "recent" ? "page" : undefined} onClick={() => onNavigate("/recent")}><MessageCircle size={20} /><span>Chats</span></button><button className={route.page === "pricing" || route.page === "subscribe" ? "active" : ""} aria-current={route.page === "pricing" || route.page === "subscribe" ? "page" : undefined} onClick={() => onNavigate("/pricing")}><TicketPercent size={20} /><span>Plans</span></button><button className={route.page === "me" ? "active" : ""} aria-current={route.page === "me" ? "page" : undefined} onClick={() => onNavigate("/account")}><UserRound size={20} /><span>Me</span></button></nav>; }

function TopBar({ title, state, onPremium, onLogin, onBack, showPremium = true }: { title?: string; state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; onBack?: () => void; showPremium?: boolean }) { const premiumActive = Boolean(state.userId && state.subscription.status === "active"); return <header className="topbar">{onBack && <button className="icon-button mobile-only" onClick={onBack} aria-label="Back"><ArrowLeft size={19} /></button>}<div className="topbar-title">{title}</div><div className="topbar-actions">{showPremium && <button className={`premium-button ${premiumActive ? "is-active" : ""}`} onClick={onPremium} aria-label="View plans and upgrades" title="View plans and upgrades"><Sparkles size={15} /> {premiumActive ? "Plans & upgrades" : "Premium"}</button>}{state.userId ? <span className="user-chip"><span className="avatar avatar-tiny">D</span> Demo user</span> : <button className="sign-in-button" onClick={(event) => onLogin(event.currentTarget)}>Sign in</button>}</div></header>; }

function HomePage({ characters, allCharacters, state, onPremium, onLogin, query, tag, loading, onQuery, onTag, onRetryCatalog, onOpenChat }: { characters: Character[]; allCharacters: Character[]; state: DemoState; onPremium: () => void; onLogin: (element?: HTMLElement) => void; query: string; tag: string; loading: boolean; onQuery: (v: string) => void; onTag: (v: string) => void; onRetryCatalog: () => void; onOpenChat: (id: string) => void }) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterToggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200); return () => window.clearTimeout(timer); }, [query]);
  const availableTags = useMemo(() => ["All", ...new Set([...TAGS.filter((item) => item !== "All"), ...characters.flatMap((character) => (character.homepagePlacements || []).filter((placement) => placement.enabled && placement.section !== "Featured").map((placement) => placement.section))])], [characters]);
  const filtered = useMemo(() => {
    const matches = characters.filter((character) => {
      if (!matchesCharacterSearch(character, debouncedQuery)) return false;
      if (tag === "All") return true;
      const placement = character.homepagePlacements?.find((item) => item.section === tag);
      return placement ? placement.enabled : character.tags.includes(tag);
    });
    if (tag === "All") return matches;
    return matches.map((character, index) => ({ character, index, position: character.homepagePlacements?.find((item) => item.section === tag && item.enabled)?.position ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.position - b.position || a.index - b.index)
      .map(({ character }) => character);
  }, [characters, debouncedQuery, tag]);
  const continueChats = useMemo(() => Object.values(state.conversations)
    .filter((conversation) => conversation.messages.some((message) => message.status === "saved" || message.status === "failed"))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .flatMap((conversation) => {
      const character = allCharacters.find((item) => item.id === conversation.characterId);
      return character ? [{ character, conversation }] : [];
    })
    .slice(0, 4), [allCharacters, state.conversations]);
  useLayoutEffect(() => { const saved = readSessionValue("yellow-home-scroll"); if (saved) { const top = Number(saved); if (Number.isFinite(top) && top >= 0) window.scrollTo({ top, left: 0, behavior: "auto" }); removeSessionValue("yellow-home-scroll"); } }, []);
  const clearFilters = () => { onQuery(""); onTag("All"); };
  const closeFilters = () => { setFilterOpen(false); window.requestAnimationFrame(() => filterToggleRef.current?.focus()); };
  return <><TopBar title="Discover characters" state={state} onPremium={onPremium} onLogin={onLogin} /><div className="home-layout">
    <aside id="character-filters" className={`filter-panel ${filterOpen ? "open" : ""}`}><div className="filter-heading"><span><Menu size={16} /> Filters</span><div className="filter-heading-actions"><button onClick={clearFilters}>Reset</button><button className="filter-close" onClick={closeFilters} aria-label="Close filters"><X size={16} /></button></div></div><label className="filter-search"><Search size={16} /><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search characters, moods…" aria-label="Search characters" /></label><div className="filter-label">TAGS & SECTIONS</div><div className="tag-filter">{availableTags.map((item) => <button key={item} className={tag === item ? "selected" : ""} aria-pressed={tag === item} onClick={() => onTag(item)}>{item}<span className="tag-radio" /></button>)}</div><div className="filter-note"><CircleHelp size={14} /> Search names, descriptions, and tags.</div></aside>
    <section className="home-content"><section className="hero-banner"><img src={characters[0]?.coverImage || characters[0]?.image || CHARACTER_IMAGE_FALLBACK} alt={characters[0]?.name || "Lureva characters"} loading="eager" decoding="async" fetchPriority="high" /><div className="hero-shade" /><div className="hero-copy"><div className="eyebrow"><Zap size={13} /> A quieter kind of connection</div><h1>Find someone<br /><em>worth staying up for.</em></h1><p>Original characters. One-on-one chats. Start with a hello.</p><button className="hero-cta" onClick={() => document.getElementById("character-grid")?.scrollIntoView({ behavior: "smooth" })}>Explore characters <ArrowRight size={16} /></button></div></section>
      {state.userId && continueChats.length > 0 && <section className="continue-section" aria-label="Continue chatting"><div className="continue-heading"><div><span className="eyebrow">YOUR STORIES</span><h2>Continue chatting</h2></div><button onClick={() => navigate("/recent")}>All chats <ArrowRight size={15} /></button></div><div className="continue-rail">{continueChats.map(({ character, conversation }) => { const latest = [...conversation.messages].reverse().find((message) => message.status === "saved" || message.status === "failed"); return <button className="continue-card" key={conversation.id} onClick={() => onOpenChat(character.id)} aria-label={`Continue chatting with ${character.name}`}><img src={character.coverImage || character.image} alt="" loading="lazy" decoding="async" /><span className="continue-copy"><strong>{character.name}</strong><small>{latest?.status === "failed" ? "Message failed · retry" : latest?.content || "Pick up where you left off"}</small></span><time>{formatRelative(conversation.updatedAt)}</time></button>; })}</div></section>}
      <div className="toolbar"><div><h2>{debouncedQuery || tag !== "All" ? "Characters" : "Meet someone new"}</h2><p>{loading ? "Finding characters…" : `${filtered.length} of ${characters.length} characters`}</p></div><button ref={filterToggleRef} className="filter-toggle" onClick={() => setFilterOpen((open) => !open)} aria-expanded={filterOpen} aria-controls="character-filters"><Menu size={16} /> Filters</button><span className="toolbar-hint">Pick a card to start chatting</span></div>
      <div id="character-grid" className="character-grid" aria-busy={loading}>{loading ? Array.from({ length: 10 }).map((_, index) => <div key={index} className="character-card skeleton-card" />) : filtered.map((character, index) => <CharacterCard key={character.id} character={character} eager={index < 5} highPriority={index < 2} onClick={() => onOpenChat(character.id)} />)}</div>
      {!loading && !filtered.length && <div className="empty-state"><Search size={28} /><h3>{characters.length ? "No characters match that search" : "New characters are on their way"}</h3><p>{characters.length ? "Try another name or clear the selected tag." : "There are no public characters available right now."}</p><button className="secondary-button" onClick={characters.length ? clearFilters : onRetryCatalog}>{characters.length ? "Clear filters" : "Try again"}</button></div>}
      <div className="content-disclaimer"><LockKeyhole size={14} /> Browser-bound demo · Chats may be processed by the configured AI provider. Avoid sensitive information.</div>
    </section>
  </div></>;
}

function CharacterCard({ character, eager = false, highPriority = false, onClick }: { character: Character; eager?: boolean; highPriority?: boolean; onClick: () => void }) {
  const [failed, setFailed] = useState(false);
  const image = character.coverImage || character.image;
  return <button className="character-card" onClick={onClick} aria-label={`Chat with ${character.name}`}>
    <div className="card-image-wrap">{failed ? <div className="image-fallback"><span>{character.name.slice(0, 1)}</span><small>{character.name}</small></div> : <img src={image} srcSet={characterCardImageSrcSet(image)} sizes="(min-width: 1400px) 20vw, (min-width: 768px) 25vw, 50vw" alt="" loading={eager ? "eager" : "lazy"} decoding="async" fetchPriority={highPriority ? "high" : "auto"} style={{ objectPosition: character.objectPosition }} onError={() => setFailed(true)} />}<span className="card-open-cue"><MessageCircle size={13} /> Chat</span></div>
    <div className="card-body"><h3>{character.name}</h3><p>{character.tagline}</p><div className="card-tags">{character.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
  </button>;
}

async function streamSimulatedReply(characterName: string, _prompt: string, conversationId: string, onDelta: (chunk: string) => void, signal: AbortSignal): Promise<ChatResponse> {
  const replies = [
    "I’m glad you told me. Let’s take this one moment at a time—what feels most important to you right now?",
    "I’m listening. There’s no need to rush the story; tell me a little more about what happened next.",
    "That gives me a lot to think about. Stay with me a little longer—where would you like our conversation to go?",
  ];
  const choice = Array.from(_prompt).reduce((sum, char) => sum + char.charCodeAt(0), characterName.length) % replies.length;
  const message = replies[choice];
  for (const chunk of message.match(/.{1,5}/gu) ?? [message]) {
    if (signal.aborted) throw new DOMException("Generation stopped", "AbortError");
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => signal.removeEventListener("abort", onAbort);
      const timer = window.setTimeout(() => { cleanup(); resolve(); }, 18);
      const onAbort = () => { window.clearTimeout(timer); cleanup(); reject(new DOMException("Generation stopped", "AbortError")); };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    onDelta(chunk);
  }
  return { conversationId, message, image: null, debug: { model: "local-demo", provider: "simulated", imageIntent: null, matchedImage: null, imageUnlock: null, memory: "Browser-only demo", contextTokens: 0, latencyMs: 0 } };
}

function ChatPage({ characters, characterId, state, update, simulatedMode, chatServiceStatus, onBack, onLogin, onPremium, onPaywall, onFavorite, onOpenCharacter }: { characters: Character[]; characterId: string; state: DemoState; update: (fn: (draft: DemoState) => void) => void; simulatedMode: boolean; chatServiceStatus: "checking" | "configured" | "simulated"; onBack: () => void; onLogin: (element?: HTMLElement) => void; onPremium: () => void; onPaywall: () => void; onFavorite: (id: string, trigger?: HTMLElement) => void; onOpenCharacter: (id: string) => void }) {
  const character = characters.find((item) => item.id === characterId) ?? getCharacter(characterId) ?? CHARACTERS[0];
  const draftSessionId = useRef("");
  if (!draftSessionId.current) {
    const savedSessionId = readSessionValue("yellow-draft-session");
    if (savedSessionId) draftSessionId.current = savedSessionId;
    else {
      const candidate = `tab-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
      draftSessionId.current = writeSessionValue("yellow-draft-session", candidate) ? candidate : character.id;
    }
  }
  const draftKey = draftSessionId.current === character.id ? character.id : `${character.id}:${draftSessionId.current}`;
  const [input, setInput] = useState(state.drafts[draftKey] ?? state.drafts[character.id] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [jumpVisible, setJumpVisible] = useState(false);
  const [sessionQuery, setSessionQuery] = useState("");
  const [profilePhotoIndex, setProfilePhotoIndex] = useState(0);
  const [sceneTrayOpen, setSceneTrayOpen] = useState(() => Boolean(character.sceneStarters?.length && !state.conversations[character.id]?.messages.some((message) => message.role === "user")));
  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [retryAction, setRetryAction] = useState<{ mode: "send"; messageId: string; text: string; sceneId?: string } | { mode: "regenerate"; text: string; requestId: string } | null>(() => {
    const pendingText = state.conversations[character.id]?.pendingRegenerateText;
    const requestId = state.conversations[character.id]?.pendingRegenerateRequestId;
    return pendingText ? { mode: "regenerate", text: pendingText, requestId: requestId || `regenerate-${Date.now()}` } : null;
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef(false);
  const generationControllerRef = useRef<AbortController | null>(null);
  const [streamingMessageId, setStreamingMessageId] = useState("");
  const [streamingRegeneration, setStreamingRegeneration] = useState(false);
  const [liveReply, setLiveReply] = useState("");
  const conversation = state.userId ? state.conversations[character.id] : undefined;
  const messages = conversation?.messages ?? [];
  const hasUnresolvedFailure = messages.some((message) => message.status === "failed") || retryAction?.mode === "regenerate";
  const remaining = state.userId ? quotaRemaining(state) : FREE_LIMIT;
  const isFavorite = Boolean(state.userId && state.favorites.includes(character.id));
  const profilePhotos = getCharacterProfilePhotos(character);
  const sessionCharacters = orderChatSessions(characters, state.conversations, character.id, sessionQuery);
  const selectedScene = character.sceneStarters?.find((scene) => scene.id === selectedSceneId);

  useEffect(() => () => generationControllerRef.current?.abort(), []);
  useEffect(() => { setInput(state.drafts[draftKey] ?? state.drafts[character.id] ?? ""); }, [character.id, draftKey]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: "end" }); }, [character.id]);
  useEffect(() => { if (!jumpVisible) bottomRef.current?.scrollIntoView({ block: "end" }); }, [busy, jumpVisible, liveReply, messages.length, messages[messages.length - 1]?.content]);
  const persistDraft = (value: string) => update((draft) => { if (value) draft.drafts[draftKey] = value; else delete draft.drafts[draftKey]; });
  const runGeneration = async (text: string, existingUserId?: string, regenerate = false, retryRequestId?: string, sceneId?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    generationControllerRef.current = controller;
    setError(""); setBusy(true); setRetryAction(null); setLiveReply(""); setStreamingMessageId(""); setStreamingRegeneration(regenerate);
    const runWithLatestState = async () => {
      if (controller.signal.aborted) return;
      const latest = loadState(false);
      if (!latest.userId) { onLogin(composerRef.current ?? undefined); return; }
      if (latest.usageReserved > 0) { setError("A reply is already being written in another chat. Please try again when it finishes."); return; }
      if (shouldOpenPaywall(quotaRemaining(latest))) { onPaywall(); return; }
      update((draft) => { reserveReply(draft); });
      const userId = existingUserId ?? `user-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      const requestId = regenerate ? retryRequestId ?? `regenerate-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}` : userId;
      const requestedSceneId = sceneId ?? (existingUserId ? state.conversations[character.id]?.messages.find((message) => message.id === existingUserId)?.sceneId : undefined);
      if (regenerate) update((draft) => { const current = draft.conversations[character.id]; if (current) { current.pendingRegenerateText = text; current.pendingRegenerateRequestId = requestId; } });
      if (!regenerate && !existingUserId) update((draft) => { const previous = draft.conversations[character.id]; const current = previous ?? makeConversation(character.id); if (!previous) current.updatedAt = 0; current.messages.push({ id: userId, role: "user", content: text, status: "pending", createdAt: Date.now(), ...(requestedSceneId ? { sceneId: requestedSceneId } : {}) }); draft.conversations[character.id] = current; delete draft.drafts[draftKey]; delete draft.drafts[character.id]; });
      if (!regenerate && !existingUserId) { setInput(""); setSelectedSceneId(""); setSceneTrayOpen(false); }
      let serverConversationId: string | undefined;
      let serverImageUrl: string | null = null;
      let serverImageTitle: string | null = null;
      const assistantId = `assistant-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      if (!regenerate) {
        setStreamingMessageId(assistantId);
        update((draft) => { const current = draft.conversations[character.id]; if (current) current.messages.push({ id: assistantId, role: "assistant", content: "", status: "streaming", createdAt: Date.now() }); });
      }
      try {
        const inlineCharacter = character.id.startsWith("custom-") ? { name: character.name, greeting: character.greeting, persona: character.persona, scenario: character.scenario, exampleDialogues: character.exampleDialogues } : undefined;
        let streamed = "";
        const onDelta = (delta: string) => { streamed += delta; setLiveReply(streamed); };
        const serverResponse: ChatResponse = simulatedMode
          ? await streamSimulatedReply(character.name, text, conversation?.id || `local-${character.id}`, onDelta, controller.signal)
          : regenerate
            ? await regenerateChatStream(character.id, conversation?.id || "", requestId, latest.userId, inlineCharacter, onDelta, controller.signal)
            : await sendChatStream(character.id, text, conversation?.id, requestId, latest.userId, inlineCharacter, onDelta, controller.signal, requestedSceneId);
        serverConversationId = serverResponse.conversationId;
        serverImageUrl = serverResponse.image?.imageUrl || null;
        serverImageTitle = serverResponse.image?.title || null;
        streamed = serverResponse.message;
        update((draft) => { const current = draft.conversations[character.id] ?? makeConversation(character.id); if (serverConversationId) current.id = serverConversationId; if (regenerate) { const target = current.messages[current.messages.length - 1]; if (target?.role === "assistant") { const old = { id: target.activeVariantId ?? `${target.id}-v${target.variants?.length ?? 0}`, content: target.content, createdAt: target.createdAt }; target.variants = [...(target.variants ?? []), old]; target.activeVariantId = `${target.id}-v${target.variants.length}`; target.content = streamed; target.imageUrl = serverImageUrl; target.imageTitle = serverImageTitle; target.status = "saved"; delete current.pendingRegenerateText; delete current.pendingRegenerateRequestId; current.contextRevision += 1; current.memory.contextRevision = current.contextRevision; } } else { const user = current.messages.find((message) => message.id === userId); const assistant = current.messages.find((message) => message.id === assistantId); if (user) user.status = "saved"; if (assistant) { assistant.status = "saved"; assistant.content = streamed; assistant.imageUrl = serverImageUrl; assistant.imageTitle = serverImageTitle; } current.memory = extractMemory(current, text); } current.updatedAt = Date.now(); commitReply(draft); draft.conversations[character.id] = current; });
        setLiveReply(""); setStreamingMessageId(""); setStreamingRegeneration(false);
        if (!regenerate && !existingUserId) setInput(""); setError(""); setRetryAction(null);
        if (shouldOpenPaywall(quotaRemaining(loadState(false)))) onPaywall();
      } catch (generationError) {
        const canceled = controller.signal.aborted || (generationError instanceof Error && generationError.name === "AbortError");
        update((draft) => { releaseReply(draft); const current = draft.conversations[character.id]; if (current) { if (!regenerate) { current.messages = current.messages.filter((message) => message.id !== assistantId); const user = current.messages.find((message) => message.id === userId); if (user) user.status = "failed"; } else { current.pendingRegenerateText = text; current.pendingRegenerateRequestId = requestId; } } });
        setLiveReply(""); setStreamingMessageId(""); setStreamingRegeneration(false);
        const failureMessage = canceled
          ? "Generation stopped. Retry whenever you’re ready."
          : generationError instanceof TypeError
            ? "Lureva’s conversation service is unavailable. Start or restart the local service, then retry."
            : generationError instanceof Error
              ? generationError.message
              : "Couldn’t save this reply. Try again.";
        setError(failureMessage); setRetryAction(regenerate ? { mode: "regenerate", text, requestId } : { mode: "send", messageId: userId, text, ...(requestedSceneId ? { sceneId: requestedSceneId } : {}) });
      }
    };
    try {
      if (navigator.locks?.request) await navigator.locks.request("yellow-demo-generation", { mode: "exclusive" }, runWithLatestState);
      else await runWithLatestState();
    } catch {
      setError("Couldn’t start the reply safely. Please try again.");
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null;
      busyRef.current = false; setBusy(false);
    }
  };
  const stopGeneration = () => generationControllerRef.current?.abort();
  const retry = (action: { mode: "send"; messageId: string; text: string; sceneId?: string } | { mode: "regenerate"; text: string; requestId: string }) => action.mode === "regenerate" ? runGeneration(action.text, undefined, true, action.requestId) : runGeneration(action.text, action.messageId, false, undefined, action.sceneId);
  const send = () => { if (hasUnresolvedFailure) { setError("Retry the unsent message above before sending another one."); return; } const text = input.trim(); if (!text) { setError("Write something first."); return; } if (text.length > 2000) { setError("Keep your message under 2,000 characters."); return; } runGeneration(text, undefined, false, undefined, selectedSceneId || undefined); };
  const regenerate = () => { const last = messages[messages.length - 1]; const before = messages[messages.length - 2]; if (!last || last.role !== "assistant" || last.status !== "saved" || !before || before.role !== "user") return; runGeneration(before.content, undefined, true, undefined, before.sceneId); };
  return <div className="chat-page">
    <header className="chat-global-header"><div className="chat-brand"><span className="chat-menu-symbol" aria-hidden="true"><Menu size={25} /></span><button className="chat-brand-name" onClick={onBack}><span className="chat-brand-mark">L</span><span>Lure</span><span className="chat-brand-accent">va</span></button></div><div className="chat-global-actions"><span className="chat-demo-chip">{chatServiceStatus === "checking" ? "CHECKING CHAT MODE" : simulatedMode ? "DEMO · SIMULATED CHAT" : "API KEY CONFIGURED · NOT VERIFIED"}</span><button className={`chat-premium-cta ${state.subscription.status === "active" ? "is-active" : ""}`} onClick={onPremium}><TicketPercent size={17} /> {state.subscription.status === "active" ? "Plans & upgrades" : "优质的 七折优惠"}</button>{state.userId ? <button className="chat-user-avatar" title="My account and settings" onClick={() => navigate("/account")}>D<span /></button> : <button className="chat-user-avatar guest" title="Sign in" onClick={() => onLogin()}> <UserRound size={18} /><span /></button>}</div></header>
    <div className="chat-workspace">
      <aside className="chat-sessions"><div className="sessions-heading"><h1>聊天</h1><button title="Groups — not available in this demo" disabled><Users size={19} /><span>新集团</span></button></div><label className="sessions-search"><Search size={19} /><input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="搜索个人资料……" aria-label="搜索个人资料" /></label><div className="sessions-list">{sessionCharacters.map((person) => { const thread = state.conversations[person.id]; const latest = thread?.messages[thread.messages.length - 1]; const previewText = latest?.content ?? (person.id === character.id ? "准备好开始聊天" : ""); return <button className={`session-row ${person.id === character.id ? "active" : ""}`} key={person.id} onClick={() => person.id !== character.id && onOpenCharacter(person.id)}><img src={person.image} alt="" /><span className="session-copy"><strong>{person.name}</strong><small>{previewText}</small></span><time>{thread ? new Date(thread.updatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : person.id === character.id ? "新对话" : ""}</time></button>; })}{sessionCharacters.length === 0 && <div className="sessions-empty">没有找到会话</div>}</div></aside>
      <section className="chat-main"><header className="chat-conversation-header"><button className="chat-back" onClick={onBack} aria-label="返回"><ArrowLeft size={20} /></button><img src={character.image} alt="" /><div className="chat-heading-copy"><strong>{character.name} <BadgeCheck size={18} fill="#f1378f" strokeWidth={2.5} /></strong><span className="chat-character-status"><i /> 虚构角色 · 随时继续</span></div><div className="chat-action-buttons"><button aria-label="Video unavailable" title="视频 · 演示版暂不可用" disabled><Video size={24} fill="currentColor" /></button><button aria-label="Call unavailable" title="通话 · 演示版暂不可用" disabled><Phone size={23} fill="currentColor" /></button><button aria-label="More unavailable" title="更多操作 · 演示版暂不可用" disabled><MoreHorizontal size={25} /></button><button aria-label="Settings unavailable" title="会话设置 · 演示版暂不可用" disabled><ListVideo size={25} /></button><button className={`chat-favorite ${isFavorite ? "is-favorite" : ""}`} onClick={(event) => onFavorite(character.id, event.currentTarget)} aria-label={isFavorite ? "Remove favorite" : "Add favorite"}><Heart size={20} fill={isFavorite ? "currentColor" : "none"} /></button></div></header>
        <div className="chat-conversation-body">
          <div className="chat-transcript" onScroll={(event) => setJumpVisible(event.currentTarget.scrollHeight - event.currentTarget.scrollTop - event.currentTarget.clientHeight > 160)} aria-live="polite">
            <div className="chat-bubbles">
              {character.greeting && <div className="chat-bubble-row from-character chat-greeting"><div className="chat-bubble"><p>{character.greeting}</p><footer><time>开场白</time></footer></div></div>}
              {messages.map((message, index) => <div className={`chat-bubble-row ${message.role === "user" ? "from-user" : "from-character"}`} key={message.id}>
                    <div className={`chat-bubble ${message.status === "failed" ? "failed" : ""}`}>
                      {message.role === "user" && message.sceneId && <span className="message-scene-cue">场景 · {character.sceneStarters?.find((scene) => scene.id === message.sceneId)?.title || "已选场景"}</span>}
                      <p>{message.id === streamingMessageId ? liveReply : message.content || (message.status === "streaming" ? "正在输入……" : "")}</p>
                      {message.imageUrl && <figure className="chat-scene-card"><img className="chat-bubble-image" src={assetUrl(message.imageUrl)} alt={message.imageTitle || `${character.name}的场景图片`} loading="lazy" decoding="async" /><figcaption><span><Sparkles size={12} /> 场景卡片</span><strong>{message.imageTitle || "一起度过的片刻"}</strong></figcaption></figure>}
                      <footer><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>{message.role === "user" && message.status === "saved" && <CheckCheck size={16} />}</footer>
                      {message.status === "failed" && <button className="chat-retry" onClick={() => retry({ mode: "send", messageId: message.id, text: message.content, sceneId: message.sceneId })} disabled={busy}><RotateCcw size={14} /> Retry</button>}
                      {message.role === "assistant" && index === messages.length - 1 && message.status === "saved" && <button className="chat-regenerate" onClick={regenerate} disabled={busy}><RotateCcw size={13} /> Regenerate</button>}
                    </div>
                  </div>)}
              {streamingRegeneration && liveReply && <div className="chat-bubble-row from-character chat-live-regeneration"><div className="chat-bubble"><p>{liveReply}</p><footer><time>新版本 · 生成中</time></footer></div></div>}
            </div>
            {(error || retryAction?.mode === "regenerate") && <div className="chat-error"><CircleHelp size={16} /><span>{error || "The failed regenerate is ready to retry."}</span>{retryAction?.mode === "regenerate" && <button onClick={() => { if (retryAction?.mode === "regenerate") retry(retryAction); }}>Retry</button>}</div>}
            {busy && !liveReply && <div className="chat-typing"><span className="typing-dots"><i /><i /><i /></span><span>{character.name}正在输入……</span></div>}
            <div ref={bottomRef} />
          </div>
          {jumpVisible && <button className="jump-latest" onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}>Jump to latest <ChevronDown size={15} /></button>}
          <div className="chat-composer-area"><div className={`quota-line ${remaining <= 3 ? "quota-warning" : ""}`}><span>{state.userId && state.subscription.status === "active" ? `${remaining} replies left this billing period` : `${remaining} free replies left`}</span>{remaining <= 3 && <button onClick={onPremium}>Get more replies</button>}</div>{character.sceneStarters?.length ? <section className={`scene-picker ${sceneTrayOpen ? "is-open" : ""}`} aria-label={`${character.name}的场景选择`}><div className="scene-picker-bar"><button type="button" className="scene-picker-toggle" onClick={() => setSceneTrayOpen((open) => !open)} aria-expanded={sceneTrayOpen}><span><Sparkles size={14} />{selectedScene ? `已选场景 · ${selectedScene.title}` : "选择一个聊天场景"}</span><small>{sceneTrayOpen ? "收起" : "换个片刻"}<ChevronDown size={14} /></small></button>{selectedScene && <button type="button" className="scene-picker-clear" onClick={() => setSelectedSceneId("")} aria-label="清除已选场景"><X size={13} /></button>}</div>{sceneTrayOpen && <><p className="scene-picker-hint">横向浏览 5 个片刻；选图开启情境，消息仍可编辑</p><div className="scene-picker-cards">{character.sceneStarters.map((scene) => <button type="button" key={scene.id} className={`scene-picker-card ${selectedSceneId === scene.id ? "is-selected" : ""}`} aria-pressed={selectedSceneId === scene.id} onClick={() => { setSelectedSceneId(scene.id); if (!input.trim()) { setInput(scene.prompt); persistDraft(scene.prompt); composerRef.current?.focus(); } }}><img src={scene.imageUrl} alt="" loading="lazy" decoding="async" /><span className="scene-picker-card-copy"><strong>{scene.title}</strong><small>{scene.hint}</small></span>{selectedSceneId === scene.id && <span className="scene-picker-selected"><Check size={12} /> 已选择</span>}</button>)}</div></>}</section> : null}{hasUnresolvedFailure && <div className="composer-blocked-note"><CircleHelp size={14} /> {retryAction?.mode === "regenerate" ? "Retry the failed regenerate above before sending a new one." : "Retry the unsent message above before sending a new one."}</div>}<div className={`chat-composer ${selectedScene ? "has-selected-scene" : ""}`}>{selectedScene && <div className="composer-scene-chip"><Sparkles size={12} /><span>{selectedScene.title}</span></div>}<textarea ref={composerRef} value={input} maxLength={2000} placeholder={state.userId ? "写条消息……" : "登录后开始聊天……"} onChange={(event) => { setInput(event.target.value); persistDraft(event.target.value); setError(""); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !(event.nativeEvent as KeyboardEvent).isComposing) { event.preventDefault(); send(); } }} aria-label="Message" /><button className={`chat-send-button ${busy ? "is-stop" : ""}`} onClick={busy ? stopGeneration : send} disabled={!busy && (state.usageReserved > 0 || hasUnresolvedFailure)} aria-label={busy ? "停止生成" : "发送消息"}>{busy ? <Square size={16} fill="currentColor" /> : <Send size={19} fill="currentColor" />}</button></div><div className="chat-composer-meta"><span>{busy ? "点击停止生成" : "Enter 发送 · Shift + Enter 换行"}</span><span>{input.length}/2,000</span></div></div>
        </div>
      </section>
      <aside className="chat-profile"><div className="profile-photo-area"><img className="profile-photo" src={profilePhotos[profilePhotoIndex]} alt={character.name} /><button className="profile-photo-nav previous" aria-label="上一张角色照片" onClick={() => setProfilePhotoIndex((index) => (index + profilePhotos.length - 1) % profilePhotos.length)}><ChevronLeft size={23} /></button><button className="profile-photo-nav next" aria-label="下一张角色照片" onClick={() => setProfilePhotoIndex((index) => (index + 1) % profilePhotos.length)}><ChevronRight size={23} /></button><div className="profile-photo-dots">{profilePhotos.map((photo, index) => <button key={`${index}-${photo}`} className={index === profilePhotoIndex ? "active" : ""} aria-label={`角色照片 ${index + 1}`} onClick={() => setProfilePhotoIndex(index)} />)}</div></div><div className="profile-overview"><h2>{character.name}</h2><p>{character.persona}</p><div className="profile-socials"><button aria-label="Instagram unavailable" title="社交链接暂未配置" disabled><Camera size={19} /></button><button aria-label="TikTok unavailable" title="社交链接暂未配置" disabled><Music2 size={18} /></button></div></div><section className="profile-about"><h3>关于我：</h3><div className="profile-facts"><div><span className="fact-icon">TAG</span><span><small>角色类型</small><strong>{character.tags[0] ?? "Character"}</strong></span></div><div><span className="fact-icon"><Heart size={18} /></span><span><small>主题</small><strong>{character.tags[1] ?? "Conversation"}</strong></span></div></div><div className="profile-tags">{character.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section><div className="profile-actions"><button className={isFavorite ? "is-favorite" : ""} onClick={(event) => onFavorite(character.id, event.currentTarget)}><Heart size={16} fill={isFavorite ? "currentColor" : "none"} /> {isFavorite ? "已收藏" : "收藏角色"}</button><button onClick={() => navigate("/me")}><UserRound size={16} /> 我的空间</button></div></aside>
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

function subscriptionStatusLabel(status: DemoState["subscription"]["status"]) { return status === "active" ? "Demo active" : status === "pending" ? "Pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Canceled" : "Free"; }
function subscriptionPlanName(status: DemoState["subscription"]["status"]) { return status === "active" ? "Demo Premium preview" : status === "pending" ? "Payment pending" : status === "failed" ? "Payment failed" : status === "canceled" ? "Checkout canceled" : "Free plan"; }
function subscriptionPlanDetail(state: DemoState) { const status = state.subscription.status; return status === "active" ? `Simulated entitlement · ${quotaRemaining(state)} of ${PLAN.replies} replies left · through ${state.subscription.periodEnd}` : status === "pending" ? "Premium stays locked until payment is confirmed" : status === "failed" ? "No Premium access was granted · try checkout again" : status === "canceled" ? "No charge was made · try checkout again when ready" : `${quotaUsed(state)} of ${quotaLimit(state)} free replies used`; }
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
  const recentConversations = Object.values(state.conversations)
    .filter((conversation) => conversation.messages.some((message) => message.status === "saved" || message.status === "failed"))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5);
  return <div className="me-page">
    <TopBar title="My account" state={state} onPremium={onPremium} onLogin={onLogin} />
    <div className="me-wrap">
      <div className="me-heading"><div><span className="eyebrow">YOUR SPACE</span><h1>My account</h1><p>Your conversations and favorite characters, together.</p></div>{state.userId && <button className="secondary-button" onClick={onLogout}><LogOut size={15} /> Sign out</button>}</div>
      <section className="me-section recent-account-section">
        <div className="section-title"><div><span className="eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2>Recent chats</h2></div><span>{recentConversations.length}</span></div>
        {recentConversations.length ? <div className="recent-list">{recentConversations.map((conversation) => {
          const character = characterById.get(conversation.characterId);
          if (!character) return null;
          const latest = [...conversation.messages].reverse().find((message) => message.status === "saved" || message.status === "failed");
          const preview = latest?.status === "failed" ? "Unsent · tap to retry" : latest?.content ?? "Ready when you are.";
          return <button className="recent-row" key={conversation.id} onClick={() => onNavigate(`/chat/${character.id}?returnTo=${encodeURIComponent("/account")}`)}><img src={character.image} alt="" loading="lazy" decoding="async" /><span><strong>{character.name}</strong><small>{preview}</small></span><time>{formatRelative(conversation.updatedAt)}</time><ArrowRight size={16} /></button>;
        })}</div> : <EmptyLink copy="No conversations yet" action="Explore characters" onClick={() => onNavigate("/discover")} />}
      </section>
      <section className="me-section subscription-section">
        <div className="section-title"><div><span className="eyebrow">BILLING</span><h2>Subscription</h2></div><span className={`status-pill ${state.subscription.status}`}>{subscriptionStatusLabel(state.subscription.status)}</span></div>
        <div className="account-plan"><div><strong>{subscriptionPlanName(state.subscription.status)}</strong><p>{subscriptionPlanDetail(state)}</p></div><button className="primary-button" onClick={onPremium}>{state.subscription.status === "active" ? "View plans & upgrades" : subscriptionActionLabel(state.subscription.status)}</button></div>
      </section>
      <section className="me-section">
        <div className="section-title"><div><span className="eyebrow">CREATED HERE</span><h2>Your characters</h2></div><span>{state.customCharacters.length}</span></div>
        {state.customCharacters.length ? <div className="favorite-grid">{state.customCharacters.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onNavigate(`/chat/${character.id}`)} />)}</div> : <EmptyLink copy="No characters created yet" action="Create a character" onClick={() => onNavigate("/create")} />}
      </section>
      {!state.userId ? <div className="account-empty"><div className="empty-icon"><LockKeyhole size={22} /></div><h2>Continue in the demo</h2><p>Real accounts and private cross-device sync are not connected.</p><button className="primary-button" onClick={onLogin}><LogIn size={16} /> Continue</button></div> : <section className="me-section">
        <div className="section-title"><div><span className="eyebrow">SAVED</span><h2>Favorite characters</h2></div><span>{favoriteCharacters.length}</span></div>
        {favoriteCharacters.length ? <div className="favorite-grid">{favoriteCharacters.map((character) => <CharacterCard key={character.id} character={character} onClick={() => onNavigate(`/chat/${character.id}`)} />)}</div> : <EmptyLink copy="No favorites yet" action="Explore characters" onClick={() => onNavigate("/discover")} />}
      </section>}
      <section className="me-section account-settings-section">
        <div className="section-title"><div><span className="eyebrow">PROFILE</span><h2>Account settings</h2></div><span>{state.userId ? "Demo account" : "Guest"}</span></div>
        <div className="account-settings-grid"><div><small>Signed in as</small><strong>{state.userId ? "Private browser session" : "Guest"}</strong><p>This demo does not connect a real account or sync conversations across devices.</p></div><div><small>Data & privacy</small><strong>Separated by browser session</strong><p>The API uses a signed, HttpOnly browser cookie to scope chat history. In the static demo, simulated chats stay in this browser profile. Avoid sensitive information.</p></div></div>
      </section>
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

function LoginModal({ onClose, onSignIn }: { onClose: () => void; onSignIn: () => void }) { const ref = useRef<HTMLButtonElement>(null); useEffect(() => { ref.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]); return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="login-modal" role="dialog" aria-modal="true" aria-labelledby="login-title" aria-describedby="login-description" onKeyDown={trapDialogTab}><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><span className="modal-mark">L</span><h2 id="login-title">Keep your place</h2><p id="login-description">Continue in a private browser session. This demo does not create a real account or sync across devices; avoid sensitive information.</p><button ref={ref} className="primary-button full" onClick={onSignIn}><LogIn size={16} /> Continue in this browser</button><small className="modal-demo-note">No real account is created.</small></div></div>; }
function PaywallModal({ character, onClose, onContinue }: { character?: Character; onClose: () => void; onContinue: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const featuredPlan = plans.find((plan) => "recommended" in plan && plan.recommended) ?? plans[0];
  const yearlyPrice = getPlanPrice(featuredPlan, "yearly");
  const monthlyMessages = featuredPlan.features.find((feature) => feature.toLowerCase().includes("messages")) ?? "More monthly conversations";
  const memoryBenefit = featuredPlan.features.find((feature) => feature.toLowerCase().includes("memory")) ?? "Conversation history";
  useEffect(() => { closeRef.current?.focus(); const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="paywall-modal" role="dialog" aria-modal="true" aria-labelledby="paywall-title" aria-describedby="paywall-description" onKeyDown={trapDialogTab}>
    <button ref={closeRef} className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
    {character && <img className="paywall-avatar" src={character.image} alt="" />}
    <span className="eyebrow">FREE REPLIES USED</span><h2 id="paywall-title">Keep your story close</h2>
    <p id="paywall-description">Explore plans for longer conversations, more monthly messages, and memory features. You can return to this chat at any time.</p>
    <div className="paywall-plan"><strong>{featuredPlan.name} · ${yearlyPrice.total.toFixed(2)}<small> / year</small></strong><span>${yearlyPrice.monthlyEquivalent.toFixed(2)} / month · {monthlyMessages} · {memoryBenefit}</span></div>
    <p className="paywall-demo-note">Demo only: checkout does not charge or unlock paid features.</p>
    <button className="checkout-button full" onClick={onContinue}>Explore plans <ArrowRight size={17} /></button><button className="text-button" onClick={onClose}>Maybe later</button>
  </div></div>;
}
