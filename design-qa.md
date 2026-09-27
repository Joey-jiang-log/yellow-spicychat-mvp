# Chat page visual QA

final result: blocked

## Chat composer focus refinement (2026-09-27)

- Source reference: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-1d4912e0-a27f-4e50-a062-21ad558e1def.png` (1298 × 298 px; focused message composer showing a hard lavender rectangle around the textarea).
- Change: the chat textarea no longer receives the global rectangular focus ring. Focus is instead indicated by a restrained border and soft plum halo on the rounded composer container; the visible focus treatment is scoped to Chat and does not alter other form controls.
- Implementation screenshot / viewport: not captured. The browser provider failed to initialize its request-header policy in this turn, so the actual focused rendering could not be observed or persisted.
- Verification: typecheck PASS; tests PASS (3 files / 16 tests; HTTP test rerun with local networking enabled); production build PASS; `git diff --check` PASS.
- Visual status: implementation is consistent with the requested fix by selector inspection, but image comparison and keyboard-focus visual inspection remain unverified.

final result: blocked

## Target and capture status

- Source visual truth: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-c9b21723-7660-4e45-9e6b-a4effdb34862.png` (2048 × 1416 source pixels; user preview was rendered at 1897 × 1312).
- Intended implementation: local Vite app, `/chat/luna`.
- Intended viewport: 1488 × 1024 CSS px, desktop density 1.
- Implementation screenshot: unavailable. The selected in-app browser denied local navigation because its admin-enforced browser security check was unavailable. No alternate browser/automation path was used.
- Comparison state: reference is a populated chat with a blonde character profile image; implementation includes a populated, non-persisted preview when a conversation has no saved messages.
- Normalization: not performed; no implementation capture could be taken.
- Full-view and focused-region comparison: not possible without a rendered implementation screenshot. Therefore two visual calibration rounds were not completed.

## Findings

- [P1] Character profile image does not match the reference. The reference shows a blonde character in a vivid blue dress against a blue bedroom background; the existing Luna asset shows a dark-haired radio host in a purple studio, and the chat profile currently reuses character assets. This is an evident image-source mismatch, though the browser-rendered crop could not be inspected. Replace/assign a closer licensed or generated portrait asset for this profile slot, then verify crop and focal point at 1488 × 1024.
- [P1] Pixel-level layout and visual calibration remain unverified. The four-column CSS uses the requested 104 / 338 / flexible / 310 px desktop tracks and a 60 px global header, but actual browser measurements, message wrapping, image height, composer placement, and scroll behavior could not be inspected. Obtain a permitted browser session, capture desktop and mobile, and perform the requested two visual comparison rounds.

## Required fidelity surfaces

- Typography: reference uses a neutral rounded sans, bright white headings, ~16 px message copy, and compact 10–14 px metadata. The implementation retains the existing Inter/system stack and targets similar sizes; rendered glyph metrics and line wrapping are unverified.
- Spacing and layout rhythm: code targets the screenshot's four columns, independent scrolling, 88 px chat heading row, ~480 px profile image, and fixed composer. Pixel alignment and overflow are unverified.
- Colors and visual tokens: chat-scoped colors target layered charcoal surfaces, subtle separators, #292929 assistant bubbles, purple-blue user bubbles, and green online state. Screenshot sampling against the rendered result is unverified.
- Image quality and asset fidelity: images reuse existing character assets; the primary portrait is materially different from the reference subject and setting.
- Copy and content: chat labels and composer placeholder are localized to match the screenshot; an unsaved preview transcript supplies visual density without affecting persistence or model context. Actual content wrapping is unverified.

## Comparison history

- Round 1: implementation was adjusted from a centered single-column conversation to a full-height four-column chat layout with distinct scroll regions and screenshot-inspired bubbles. Code-level checks passed. No browser screenshot was available, so this is not a visual QA pass.
- Round 2: not performed. Browser access remained blocked before a screenshot could be captured.

## Open questions

- A closer portrait image is needed to reproduce the large right-hand image accurately.
- Local browser security verification must become available before rendered comparison and the requested final screenshot can be produced.

## Implementation checklist

- [x] Implement chat-only four-column desktop layout and responsive collapse rules.
- [x] Preserve existing send, generation, retry, regenerate, favorite, login, quota, and route behavior.
- [x] Keep the no-history preview out of persisted state and model context.
- [x] Run type check, tests, and production build.
- [ ] Capture the page at 1488 × 1024 and at a mobile viewport.
- [ ] Compare reference and implementation together; perform two visual calibration rounds.
- [ ] Replace/assign a closer profile portrait and verify its crop.

## Pricing and character creation expansion (2026-09-27)

final result: blocked

- Reference material: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-55ada3a5-1a9b-4151-a8d8-4d0075fe2fa1.png` (Pricing), `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-7cf0dca0-681b-41dd-be72-2fc1c2e4f322.png` (Create Character), and `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-4cb6af20-ee2e-4a1e-abec-0a1c010d2e9e.png` (Yellow Discover baseline).
- Visual implementation screenshots: not captured. The in-app browser provider failed initialization (`codex app-server exited before returning initialize`); direct Chrome UI control reported that computer-use permissions are not granted. No browser automation workaround was used.
- Local runtime evidence: Vite returned HTTP 200 for `/`, `/pricing`, and `/create`; API `/api/health` returned `ok: true`. Starting duplicate servers reported ports 4173 and 4174 already in use, confirming existing local services.
- Automated verification: `npm run typecheck`, `npm test` (11 tests), and `npm run build` passed.
- Route/flow code review: `/discover`, `/create`, `/pricing`, `/account`, and `/chat/:characterId` are handled while `/`, `/me`, and `/subscribe` remain aliases. Create -> local persistence -> Discover/Chat and Premium -> Pricing -> payment placeholder are wired in the existing app shell.
- Visual comparison rounds: 0 rendered comparison rounds completed. The screenshot references were inspected, but desktop/mobile measurements, crop inspection, and interactive browser flows remain unverified due to the permissions blocker. Do not treat the successful build or route HTTP responses as visual or end-to-end acceptance.
- Remaining risk: localStorage has finite capacity; character images are limited to 700 KB and retained as local data URLs. Pricing amounts, package output estimates, optional character capabilities, and checkout are mock-only; payment and generated imagery are not connected to real providers.
- Required follow-up: grant browser/computer-use access, capture Discover/Pricing/Create at desktop and mobile sizes, run the full create -> discover -> chat and premium -> checkout-placeholder paths, and complete two visual calibration rounds before changing this result to pass.

## Account navigation feedback follow-up (2026-09-27)

- Sidebar “Recent chats” now routes to its own `/recent` conversation list instead of landing on the account screen; opening a conversation returns to `/recent`. Legacy `/account#recent` and `/me#recent` URLs resolve to the recent-chat view.
- The bottom account entry is now a compact avatar-only control (rather than another full-width “My account” nav row) and opens `/account`, which remains the profile, subscription, created-character, and favorites settings surface. This leaves “Recent chats” and account settings as visually distinct destinations.
- Premium CTA labels now explicitly say “Plans & upgrades” when the demo subscription is active, and both account and chat-header CTAs navigate to `/pricing` rather than back to the account page.
- Pricing display math was corrected: monthly prices show monthly billing without a misleading struck-through amount; annual equivalents and savings are calculated from the full monthly rate. Two pricing tests cover monthly and yearly totals/savings.
- Verification: typecheck PASS; lint PASS; tests PASS (13/13); production build PASS; local HTTP checks PASS for `/discover`, `/recent`, `/account`, `/pricing`, and legacy `/subscribe` (all 200).
- Browser interaction verification is now available in an isolated local tab: Recent chats -> conversation -> Yellow brand return reached `/recent`; `/account#recent` rendered the recent-chat page; account page did not visibly render the Recent conversations heading; active plan CTA navigated to `/pricing?returnTo=%2Faccount`; choosing Basic opened a checkout-preview dialog explicitly stating no charge and no entitlement change; character preview stayed disabled until required fields were filled, then showed the entered mock details. No character was submitted and no payment was attempted.
- An isolated origin on `127.0.0.1:4175` exercised Create -> Discover -> Chat -> Recent chats -> Chat. A temporary character persisted across reload and appeared under the account's created characters. A local mock message saved, Regenerate replaced only the final response, refresh retained the 2-turn transcript and quota, and an intentional `[fail]` turn left quota unchanged; its retry saved once and decremented one reply. No live model/payment or real user data was used.
- Responsive verification: no horizontal overflow was measured at 390 px, 768 px, 1024 px, or 1488 px across Discover, Recent chats, Account, Create, Pricing, and Chat. Visual captures were inspected inline for Recent chats desktop, Account mobile/desktop, Pricing mobile/desktop, and Create mobile. The mobile account Sign out label initially wrapped; CSS now prevents wrapping and a second capture confirmed the fix. These captures were not persisted as image files.
- Chat visual calibration at 1488 × 1024: pass 1 measured the profile image at 309 × 480 px (matching the requested ~310 px width and reference's ~480 px height) and AI bubbles at 624 px / 736 px transcript width (too wide); pass 2 reduced desktop bubble max-width to 74%, yielding 525 px / 736 px (71.4%, close to the reference's ~73%). The existing mobile override remains wide for readability. Screenshots were viewed inline during both passes but were not saved as files.
- Mobile navigation now includes a dedicated “Chats” tab so the Recent chats destination remains reachable when the desktop sidebar is hidden; tapping it selects `/recent` and marks the tab current. The compact avatar remains the account/settings entry on desktop.
- Browser console: isolated flow exposed a duplicate React key for repeated portrait URLs and two duplicate retry CTAs on a failed send. The photo-dot keys are now unique; a send failure keeps its bubble Retry action while the banner retains the error text without repeating the button. The existing console log is the pre-fix warning only; no new warnings/errors appeared on subsequent retry, regenerate, reload, or route tests. Existing main-origin demo conversation content includes persisted failure/retry strings; it was preserved and not edited.
- The browser became available for responsive and interaction checks during this follow-up; both visual comparison passes are complete. However, screenshot files were not retained, and `/chat/luna` shows its stored custom-character portrait (a young man) instead of the reference's blonde woman. This is user-specific character content and was not overwritten. Keep exact-reference fidelity blocked on those remaining artifact/content differences.

## Account navigation and cross-tab quota follow-up (2026-09-27)

- Recent chats is a dedicated `/recent` destination; the Recent conversations block has been removed from the account surface, so the sidebar entry and account settings no longer duplicate the same list. The account avatar opens `/account`; the top membership CTA and the subscription action on the account page both open `/pricing`.
- Browser interaction on `localhost:4173`: sidebar Recent chats reached `/recent`; sidebar “Premium active · view plans” reached `/pricing`; avatar reached `/account`; account “View plans and upgrades” reached `/pricing?returnTo=%2Faccount`. No purchase or account mutation was submitted.
- Follow-up verification after removing the duplicated account section: `/account` AX tree contains profile settings, subscription, created characters, and favorites, with no Recent conversations section; clicking the header “View plans and upgrades” opens `/pricing?returnTo=%2Faccount` and renders the yearly toggle, three plans, and credit packs. The avatar remains a compact account-settings entry, not a second labeled sidebar destination.
- An isolated `127.0.0.1:4175` two-tab race reproduced a lost update before the fix. Chat generation is now serialized with the browser Web Locks API, startup recovery waits for any active generation, updates rebase from the latest persisted snapshot, and drafts are scoped per tab session to avoid one tab clearing another tab’s unsent text.
- Cross-tab regression: submitted different messages nearly simultaneously in two isolated tabs. Both user/assistant turns persisted in the same conversation, both tabs converged to the same transcript, and the shared demo quota decreased by exactly two (15 → 13). The test used a custom local character and deterministic local reply fixture; no live model, payment, or primary demo storage was used.
- Quota security remains demo-only: browser locks coordinate tabs in one browser profile, but they are not an authority against modified clients or multiple devices. Production free-limit enforcement still requires an atomic server-side quota ledger.
- Latest verification after the persistence changes: typecheck PASS; lint PASS (configured script runs TypeScript check); tests PASS (14/14); production build PASS; `git diff --check` PASS. After a full reload, both concurrently submitted turns and the shared 13-reply balance remained identical in both isolated tabs; screenshots remain unpersisted.

## Browser regression follow-up (2026-09-27)

- The earlier statements that browser capture was unavailable are historical; later entries document the browser becoming available. This follow-up used the existing local CUA tab and did not send a chat message or attempt payment.
- Reproduced a checkout-preview accessibility defect: Tab moved focus from the dialog to plan CTAs behind it. `PricingPage` now focuses Close on open, traps Tab/Shift+Tab within the dialog, closes on Escape/backdrop, and restores focus to the plan CTA. Browser verification confirmed Close → Back to Yellow → Close cycling, Escape restoring focus to the plan CTA, and Back to Yellow returning to `/chat/luna` with the saved conversation and composer present.
- `/account` browser AX check confirmed separate account settings and recent-chat navigation, an explicit shared-demo data/privacy notice, subscription status, and working plan-navigation actions. Account text now warns chats are stored by the local API and may be sent to its configured AI provider. No sensitive content was entered.
- Narrow Pricing layout now switches to one column at the same 767 px breakpoint as the app mobile navigation; the prior 701–767 px mismatch is fixed. Earlier CUA visual checks showed the single-column mobile cards. Current visual screenshots are inline-only and were not saved as files.
- Regression after the modal fix (before adding the server privacy test): typecheck PASS; lint PASS; tests PASS (2 files / 14 tests); production build PASS; `git diff --check` PASS. Browser tests use the local simulated checkout only; real billing, provider latency, and full screen-reader verification remain unverified.
- Server/API inspection found that the public character response included Persona/system-prompt fields and accepted `status=all`, making draft/offline records publicly retrievable. The public projection now excludes prompt/model internals; collection and detail routes only expose `online` characters. Admin CRUD remains unchanged.
- Added an isolated HTTP integration test using a temporary data file and ephemeral loopback port: it creates a draft with a sentinel prompt, verifies `?status=all` still returns only published characters, checks that public payloads omit `persona`/`characterPrompt`, and confirms draft detail is 404. The full suite passes (3 files / 15 tests). No model or payment call was made.
- Restarted only the verified project API listener so port 4174 loads the change; Vite remains on 4173. Browser returned to `/discover` and showed the API connected with all 22 current characters. Direct API URL navigation is blocked by the browser client, so response-field evidence is from the isolated HTTP integration test rather than a copied production/demo payload.
- Remaining production blocker is user isolation: conversation endpoints accept a caller-supplied `userId` and use shared demo storage. Billing remains local simulation; external provider latency and real account authorization are not verified.

## Lureva brand and atmosphere pass (2026-09-27)

- Source visual truth: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-070c62de-12b1-4e06-bb84-3480e2ca7299.png` (542 × 130 px crop of the current sidebar wordmark). The source displays the old Chinese/Yellow identity in the shared dark shell.
- Implementation screenshot: not captured. The Codex browser bridge could not bind to the referenced local preview tab; an attempt to open Chrome was interrupted before a page capture. No implementation viewport, pixel size, or density is claimed.
- Changes made: visible app brand and metadata now read Lureva; the sidebar and chat header use a white/berry wordmark and L monogram; plan, character creation, admin, and recovery copy use the new brand. Added restrained plum/berry ambient lighting to the shared sidebar and page canvas, with light hover lift/glow on character cards and upgrade CTA. Internal local-storage, lock, and admin-token keys retain their existing names so saved data and authorization behavior are not disrupted.
- Fidelity review: the supplied source is only a narrow logo crop, so full-page composition, typography scaling, halo strength, mobile behavior, and card hover cannot be visually compared at a matching viewport/state. The full browser-rendered comparison is blocked; no visual pass is claimed.
- Verification: typecheck PASS; lint PASS; tests PASS (3 files / 15 tests); production build PASS; `git diff --check` PASS. The localhost page itself was not screenshot-verified in this pass.
- Open visual check: capture the updated Discover sidebar at the source-equivalent viewport and compare the wordmark's size, weight, tile, sidebar width, and lighting; also check chat and Pricing to ensure the renamed brand and berry accent remain consistent.

final result: blocked

## Chat sidebar consistency follow-up (2026-09-27)

- Reference comparison: the supplied current Discover screenshot uses Yellow's shared full navigation rail; the supplied chat screenshot instead showed a separate icon-only Candy-style rail. Chat now reuses the existing `AppShell` sidebar, including its active state and responsive collapse, rather than rendering a second chat-specific rail.
- Chat's own conversation list remains adjacent to the transcript; the workspace grid now contains only sessions, conversation, and character profile columns. Removed a duplicate conversation-list column found during this pass.
- Responsive alignment: desktop content offsets by the shared sidebar width (216 px); compact desktop/tablet offsets by its 64 px collapsed width; below 768 px both routes hide the desktop sidebar and chat keeps its existing focused layout. Fixed the 768–1023 px frame width to match that collapsed-sidebar offset.
- Verification: typecheck PASS; lint PASS; production build PASS; `git diff --check` PASS. Browser capture for this exact follow-up was unavailable because the browser provider failed to initialize in this turn; the shared CSS/app-shell structure was inspected, but a new rendered desktop comparison is not claimed.
- Remaining visual check: confirm at desktop width that Discover and Chat show the same 216 px sidebar and active item treatment, then inspect the collapsed 64 px layout at tablet width. Existing chat visual caveats (portrait mismatch and retained screenshot artifact requirement) remain unchanged.

## Chat session list ordering refinement (2026-09-27)

- Source reference: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-038c0874-78ea-496c-9792-11ec606f78d5.png`, showing the chat session list and active row.
- Finding: selecting a character forced it to the first row even without new activity, making navigation look like a reorder.
- Fix: session rows now follow persisted recent-activity timestamps; a selected character with no existing session is appended rather than pinned. Starting an optimistic send no longer advances the timestamp; successful completion does.
- Browser verification: on the local `/chat/kai` view, selecting Hazel changed the route and active-row highlight while the visible session order remained Kai, Hazel, chat gpt, Noa, Cass, Sora. Browser screenshot was inspected inline but not saved as a project artifact. No message was sent, to avoid modifying the existing demo conversation data.
- Regression coverage: unit test confirms selection does not pin a row, a new unsaved character appears at the end, and a newer activity timestamp moves the relevant session to the top.
- Verification: typecheck PASS; tests PASS (3 files / 17 tests); production build PASS; `git diff --check` PASS.
- Scope note: the interaction ordering was verified in the browser; no full-page visual comparison was needed for this ordering-only change. Persistent screenshot artifact was not produced.

final result: blocked

## Accidental character portrait replacement (2026-09-27)

- Source reference: `/var/folders/w4/2ldyw4dd0fvc_mzst8zxw0k80000gn/T/codex-clipboard-d86aa1ec-a604-4474-ac29-1c865a874815.png` (646 × 1000 px; accidentally uploaded portrait in the character profile carousel).
- Target record: local demo character `luna` / “chat gpt ！！！！！”. Its `image` and `avatarUrl` held the uploaded data URI; its `coverUrl` already pointed to `/characters/luna.png`.
- Change: replaced the avatar and primary profile image with the existing `/characters/luna.png` artwork. Existing name, conversation history, profile copy, and other characters were left unchanged. The identical cover now deduplicates in the gallery.
- Visual verification: source and current implementation were opened together in one browser-capture result. At `http://localhost:4173/chat/luna` (1280 × 720 browser viewport), the existing Luna artwork appears in the chat header, session list, and profile panel; the accidental portrait is absent from all three. The capture was inspected inline and not saved as a persistent screenshot file; the source and implementation crops differ in viewport and scale, so this is a focused asset-identity check, not a full-page pixel comparison.
- Data verification: the local API returned 200 after update; the persisted record now has `image`, `avatarUrl`, and `coverUrl` set to `/characters/luna.png`, and none is an embedded upload. No message was sent and no production/payment action occurred.
- Code verification: no application code changed in this asset-only update; `git diff --check` PASS.
- Result: targeted image replacement PASS; screenshot file retention/full-page comparison not performed.

final result: blocked
