# Yellow MVP implementation status

Updated: 2026-09-14

## Current stage

- S0 Baseline: complete. Workspace was empty except for `AGENTS.md` and read-only `sources/`; no package manager, app, lockfile, or user changes existed.
- S1 Static visual: complete in code. Four requested routes, responsive shell, 12-card discovery grid, chat intro/message composer, subscription card, and account states are implemented.
- S2 Chat mainline: complete in demo mode. Local persistence, deterministic chunked streaming, drafts, retry, saved state, and final-message regenerate are implemented.
- S3 Entitlements and memory: complete in demo mode. Shared 20-reply free bucket, one 1,000-reply plan, demo paywall, subscription state, and per-character structured memory are implemented.
- S4 External integration boundary: adapter boundary is represented by `src/domain.ts`; no real Auth/LLM/database/billing credentials are present.
- S5 Independent acceptance: partial. Build/tests and targeted desktop browser interactions passed; matched mobile screenshots, reference pairing, and external-service cases remain blocked.

## Assumptions and ownership

| Area | Actual file(s) | Owner | Default |
| --- | --- | --- | --- |
| Shared character fixtures | `src/data.ts`, `public/characters/*.png` | Main | 12 original adult, non-explicit demo characters |
| Domain / persistence boundary | `src/domain.ts` | Main / Domain responsibility | localStorage-isolated demo state; service replacement must be server-side |
| Routes / UI / responsive behavior | `src/App.tsx`, `src/styles.css` | Main / UI responsibility | `/`, `/chat/:characterId`, `/subscribe`, `/me` |
| Automated domain checks | `tests/domain.test.ts` | Main / QA responsibility | Vitest deterministic fixtures |

## Evidence boundary

The provided reference URLs were attempted in the available browser on 2026-09-13 but the public image endpoint and original site did not return a stable screenshot (timeouts/cache miss). Visual choices therefore follow the supplied design/style documents: near-black canvas, 216px desktop navigation, 208px filter rail, 5-column desktop cards, 2-column mobile cards, muted gray surfaces, violet/blue emphasis, and 720px chat reading column. A live local desktop capture and AX interaction pass were completed through CUA; target-size mobile capture and source-paired pixel comparison remain unavailable.

## Blocked items

- Real LLM streaming, real authentication, database persistence, and payment-provider webhook verification: BLOCKED by missing authorized provider configuration and credentials.
- Production launch, real charges, age/content compliance, privacy/subscription terms, asset licensing review: intentionally not attempted.

## Verification completed

- `npm install` completed with the approved workspace dependency install.
- `npm run typecheck`, `npm test`, and `npm run build` pass; Vitest reports 1 file / 8 tests.
- CUA desktop pass covered the 12-card home, direct card navigation, anonymous login gate and draft retention, deterministic stream/Saved state, failure/Retry state, Regenerate, refresh persistence, single-plan subscription, demo activation, and My account.
- The four page screenshots were requested from the browser; the CUA tool emitted the desktop home capture inline, but does not expose a local screenshot path or a viewport override in this environment.

## Follow-up polish completed

- Fixed Paywall → Premium navigation so the paywall overlay cannot remain mounted over the subscription page.
- Failed user messages now retain an inline Retry action after refresh; retry reuses the original message instead of inserting a duplicate.
- The deterministic `[fail]` fixture fails only on the first attempt and succeeds on Retry, making the recovery path demonstrable.
- Added a `[regen-fail]` fixture; failed Regenerate preserves the active reply and Retry replaces it only after a successful retry.
- Added the missing static character greeting to the chat intro.
- Added mobile touch-target sizing for navigation, favorite, modal-close, and send controls; generation follows the latest message only while the user has not scrolled away.
- Added Space-key activation for the brand navigation control and capped the composer at the documented 2,000 characters.
- Added explicit accessible names to the premium and account controls when the navigation rail is collapsed.
- Removed the inert duplicate Premium action from the Premium page header.
- Paywall now receives initial focus and supports Escape dismissal like the login dialog.
- Offset the sticky top bar below the fixed demo notice so it stays readable while the chat is scrolled.
- Made the mobile character filter controlled by React state and exposed its expanded/selected state to assistive technology.
- Added startup recovery for a refresh during streaming: abandoned reservations are released, partial assistant output is removed, and the user message becomes retryable.
- Browser-verified the refresh recovery path: an interrupted send becomes `Not sent` with Retry and the free-reply count remains unchanged.
- Clear the composer once a normal send is accepted for generation, preventing accidental duplicate sends after a provider failure while preserving drafts blocked by login or quota.
- Restore the home scroll position before paint with an explicit instant scroll, preventing the global smooth-scroll setting from animating route restoration.
- Added a synchronous per-chat generation lock so rapid double-send events cannot create duplicate replies before the disabled state paints.
- Browser-verified the double-send guard: two parallel clicks created one user message, one assistant reply, and one quota decrement.
- Browser-verified the full free-quota boundary: the twentieth successful reply is readable and saved before Paywall, and post-exhaustion Send/Regenerate are blocked without changing history.
- Browser-verified the chat-to-subscribe return path: demo activation returns to the originating character chat with its readable history and Premium quota state.
- Failed sends now block a new composer submission until the unsent message is retried, with a persistent inline explanation; browser verification confirmed the blocked Send state and successful recovery.
- Invalid `/chat/:characterId` routes now return to the home grid, and subscription return URLs are allowlisted to valid internal routes.
- Logged-out direct chat URLs now hide saved messages/favorites and show the free quota rather than the prior account’s Premium entitlement; signing back in restores the demo account view.
- Added an explicit mobile filter close control and made the `Recent chats` navigation honor its `#recent` anchor; browser verification measured the anchor landing at the Recent conversations section.
- Corrected the mobile-only chat back control selector so desktop shows one back button and mobile keeps only the top-bar back action; browser AX verification showed one desktop back button.
- Added keyboard focus looping and `aria-describedby` associations to Login and Paywall dialogs; browser Tab and Shift+Tab checks stayed within the Login dialog.
- Paywall now records the triggering control and restores focus after dismissal, matching the Login modal’s return behavior.
- Added hover titles to the collapsed navigation controls so the 900–1199px icon rail remains understandable without visible labels.
- Tightened route matching to the four supported pages and normalizes unknown paths back to `/`; browser verification covered `/chat/luna/extra` and `/subscribe-anything`.
- Replaced the native Manage subscription alert with an inline status message that clearly keeps the demo billing boundary visible.
- Hardened My account recent-conversation rendering so stale or unknown character records are ignored instead of crashing the page.
- Recent-conversation links now carry a validated `/me#recent` return target, so leaving a chat from My account returns to the same section and scroll position; browser verification measured `scrollY=219` after return.
- Demo checkout now calculates the next billing date at activation time instead of retaining a stale hard-coded date.
- Recent conversation previews now surface an unresolved send as `Unsent · retry to continue`; browser verification showed the label and then confirmed it disappears after Retry succeeds.
- Anonymous Premium clicks now retain their intent through Demo login and continue to the single-plan page; browser verification reached `/subscribe?returnTo=%2F` after signing in.
- Anonymous favorite clicks now retain the selected character through Demo login and apply the favorite automatically; browser verification showed Luna changing to `Remove favorite` after sign-in.
- Closing the Login modal now clears any pending Premium/favorite intent; browser verification confirmed cancel-then-login stays on the home page while direct Premium login still reaches `/subscribe?returnTo=%2F`.
- Mobile filter dismissal now restores keyboard focus to the Filters toggle instead of leaving focus on the hidden panel.
- Active subscribers now see `Premium active` in the side rail and are routed to My account rather than being offered a misleading second upgrade action; browser verification confirmed the `/me` destination.
- Sidebar navigation now highlights exactly one account destination (`Recent chats` for `#recent`, `My account` otherwise) and exposes the active route with `aria-current`; browser DOM checks confirmed both states.
- Persisted demo state is now normalized before rendering, so malformed localStorage fields fall back to safe empty values instead of taking down the chat or account page; a deterministic regression test covers malformed conversations, drafts, favorites, and subscription data.
- Mobile primary navigation now exposes a named landmark and `aria-current` on the active destination.
- A failed Regenerate now temporarily blocks a new send until its Retry succeeds, preventing a later message from becoming the accidental replacement target; browser verification confirmed the disabled Send state and successful recovery.
- Removed the hidden mobile navigation bottom spacer from the chat route so the sticky composer can sit flush with the mobile viewport; target-device screenshot verification remains blocked by the browser environment.
- Unified Premium entry points for active subscribers: the top bar now says `Premium active`, uses the active green treatment, and routes to My account instead of reopening the purchase page; browser verification confirmed the route.
- Regenerate Retry now remains visible even if the user edits a draft after a failed attempt, preventing the locked composer from becoming unrecoverable; browser verification covered failure, draft edit, persistent Retry, and successful recovery.
- Retry and Regenerate now preserve an unrelated unsent draft; only a newly accepted user message clears the composer, preventing stale drafts from disappearing and later reappearing after navigation.
- Login focus restoration now validates the trigger before calling `.focus()`, and a render fallback gives the demo a recoverable reload action if an unexpected runtime error escapes; this prevents event-object focus bugs from becoming a blank page.
- Demo checkout now exposes explicit `failed`, `canceled`, and `pending` states without granting Premium; My account mirrors each state and offers the appropriate retry/status action.
- Failed Regenerate now persists a retry marker with the conversation, so refresh or route changes keep the original reply and an actionable Retry; CUA verified failure → refresh → Retry recovery, and successful recovery clears the marker and uses stable variant IDs.
- Demo billing outcomes now pass through one domain-layer transition function; deterministic tests verify only a success with a billing period can produce active Premium, while failed/canceled/pending outcomes keep access locked.
