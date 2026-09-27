# Yellow MVP · 64-case acceptance report

Updated: 2026-09-27

Status meanings: `PASS` means evidence was actually produced by a repository command or deterministic unit test; `BLOCKED` means the case needs the unavailable browser capture, external credentials, or a real service. No case is marked PASS solely because the code looks plausible. `Demo` cases remain explicitly simulated.

## Summary

| Result | Count |
| --- | ---: |
| PASS | 20 |
| FAIL | 0 |
| BLOCKED | 44 |

The local CUA browser pass is available for the deterministic demo flows; target-size mobile capture, assistive-technology verification, and real Auth/LLM/database/billing cases remain blocked by environment or missing authorized configuration. This is not a production-readiness claim.

## Cases

| ID | Case | Status | Evidence / blocker |
| --- | --- | --- | --- |
| H01 | Open home | PASS | Current CUA AX snapshot at `/discover` showed `22 of 22 characters`; cards expose image/name/tagline/tags only. |
| H02 | Open any card with mouse/keyboard | PASS | Clicking the first card navigated directly to `/chat/luna`. |
| H03 | Search case/whitespace and combine tag | PASS | Entered ` luna `, selected Romance, and AX showed one Luna card after the debounce window. |
| H04 | Empty/image/request failure states | BLOCKED | Fallback and deterministic failure paths are in code; browser evidence missing. |
| H05 | Filter → chat → back preserves position | PASS | Applied a character filter, entered Rowan from the scrolled grid, and returned with the selected filter and scroll position restored to 311.5px. |
| H06 | Desktop/tablet/mobile route reachability | BLOCKED | Four supported routes and unknown-path fallback are browser-verified; matched viewport screenshots remain unavailable. |
| C01 | Anonymous intro and first send | PASS | Chat AX snapshot shows the static character greeting before any model call; anonymous send opened `Keep your place`; Continue as Demo user returned with `Hello from QA` preserved in the composer. |
| C02 | Empty/long text/IME Enter | BLOCKED | Requires browser keyboard evidence. |
| C03 | Chunked reply and Saved state | PASS | CUA snapshot during send showed partial reply and disabled Send; completion showed Saved and 19 free replies left. |
| C04 | Double send/request idempotency | PASS | Parallel browser clicks on Send created one `double click guard` user message, one assistant reply, and reduced the shared quota from 17 to 16. |
| C05 | Refresh/logout/login restore | BLOCKED | Real database restore remains external; demo browser verification now confirms logout hides the prior account’s chat/favorite/Premium UI and signing back in restores the demo account view. |
| C06 | Model/save failure and Retry | PASS | Sending `[fail] retry me` showed a readable provider error, `Not sent`, and no quota loss; after refresh the inline Retry recovered the same message with one assistant reply and quota 19. A second browser check confirmed the composer Send action stays disabled until the failed message is retried, then re-enables after recovery. |
| C07 | Refresh during stream | PASS | Immediately refreshed during a deterministic send; the partial assistant output was removed, the user message became `Not sent` with Retry, and quota stayed at 17. |
| C08 | Successful Regenerate | PASS | CUA snapshots showed only the final assistant content replaced; completion showed Saved and 18 free replies left. |
| C09 | Failed Regenerate | PASS | `[regen-fail]` produced the provider error while the prior assistant reply stayed intact; the composer was disabled until Retry, the Retry action remained visible after editing a draft and after refresh, then Retry replaced only the final reply and quota decremented once. |
| C10 | Draft survives route change | PASS | Entered `draft survives route`, returned to `/`, reopened Luna, and the message textbox restored the 20-character draft; Retry/Regenerate now also preserve an unrelated draft. |
| C11 | Conversation empty state | BLOCKED | Requires browser visual evidence. |
| C12 | Character switch isolation | BLOCKED | Requires browser persistence evidence. |
| Q01 | 19th reply triggers paywall | PASS | Replenished the demo conversation to its twentieth successful reply; the full final reply remained readable/saved and Paywall opened afterward. |
| Q02 | Exhausted Send/Regenerate | PASS | After closing Paywall at 0 replies, both Send and Regenerate reopened Paywall without calling the demo generator; the draft and readable history remained intact. |
| Q03 | Exhaustion across roles/tabs | BLOCKED | Real cross-tab/server authority is unavailable. |
| Q04 | Two simultaneous sends with one left | BLOCKED | Real concurrent authority is unavailable. |
| Q05 | Crash/lease/repeated callback | BLOCKED | Requires server reservation lifecycle. |
| P01 | Pricing offers clear plan comparison | PASS | CUA AX snapshot at `/pricing` showed Monthly/Yearly controls, Basic/Plus/Studio plans, three credit packs, and a checkout preview explicitly stating no charge or entitlement change. |
| P02 | Cancel/fail checkout | BLOCKED | Demo-only `failed`, `canceled`, and `pending` checkout states are implemented and leave Premium locked; real billing adapter and provider callbacks remain unavailable. |
| P03 | URL/localStorage paid tamper | BLOCKED | Requires server-verified entitlement; no real server exists. |
| P04 | Valid payment and signed callback | BLOCKED | Missing payment credentials/webhook. |
| P05 | Invalid/duplicate/out-of-order events | BLOCKED | Missing payment provider and webhook. |
| P06 | Delayed callback | BLOCKED | Missing payment provider and webhook. |
| P07 | Active user manages subscription | PASS | Current account header offers `View plans and upgrades`; it opens `/pricing?returnTo=%2Faccount`. The sidebar and top membership CTA open `/pricing`; checkout remains an explicit non-charging placeholder. A real billing portal remains unavailable. |
| P08 | Cancel through expiry | BLOCKED | Missing billing lifecycle. |
| P09 | Renew success/failure | BLOCKED | Missing billing lifecycle. |
| P10 | Return to original chat | PASS | Pricing opened with `returnTo=%2Fchat%2Fluna`; after opening checkout preview, keyboard activation of Back to Yellow returned to `/chat/luna` with the existing transcript and composer. No payment or entitlement mutation occurred. |
| P11 | History remains readable after billing state change | PASS | The returned Rowan chat still showed its full saved history and switched to `1,000 replies left this billing period`; real entitlement lifecycle remains unavailable. |
| M01 | Long-term two-fact recall | BLOCKED | Real model and persisted context unavailable. |
| M02 | Correct name/preference facts | BLOCKED | Deterministic extractor is unit-tested only; browser/model evidence missing. |
| M03 | Regenerate removes discarded plot from context | BLOCKED | Requires real model/context evidence. |
| M04 | Stale summary revision race | BLOCKED | Requires async summary service. |
| M05 | Summary failure/budget overflow | BLOCKED | Requires summary service. |
| M06 | User/character memory isolation | BLOCKED | Requires account-backed storage. |
| M07 | Expired Premium shorter context | BLOCKED | Requires real entitlement and context service. |
| M08 | Prompt injection cannot read others | BLOCKED | Requires server-backed isolation test. |
| U01 | Three conversations sort by recent | BLOCKED | Current demo browser shows recent conversations in updated-at order and returns to the `#recent` section after opening one; three-conversation fixture evidence remains incomplete. |
| U02 | Favorite toggle and refresh | PASS | CUA toggled Luna to Favorite, navigated to `/me`, and the Favorites section showed Luna. |
| U03 | Manage current subscription | BLOCKED | Demo Manage subscription now gives an inline status without a disruptive browser alert; the real billing portal remains unavailable. |
| U04 | Logout A/login B isolation | BLOCKED | Real multi-account backend unavailable. |
| E01 | Build/lint/typecheck/unit/e2e command check | PASS | `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` passed in the latest recorded regression; `npm test` reports 3 files / 15 tests. No e2e runner is installed, so browser evidence is recorded manually through CUA plus a temporary local HTTP integration test. |
| E02 | Keys and logs | BLOCKED | Requires bundle/security inspection with real integrations. |
| E03 | Cross-account authorization | BLOCKED | Public-character integration coverage now verifies draft visibility and prompt exclusion. Conversation endpoints still trust caller-supplied `userId`; real account authorization/isolation remains unimplemented. |
| E04 | Markdown/XSS | BLOCKED | React text rendering avoids raw HTML; no browser security suite was run. |
| E05 | Mode isolation | BLOCKED | Demo banner and `DEMO_MODE` exist; production misconfiguration test requires deployment. |
| E06 | Modal focus/accessibility | BLOCKED | Browser keyboard test now confirms initial Close focus, Tab cycles Close → Back to Yellow → Close, Escape closes and restores focus to the triggering plan CTA. Full assistive-technology verification remains unavailable. Login Tab/Shift+Tab checks previously passed. |
| E07 | Mobile keyboard/safe area | BLOCKED | Requires mobile browser capture. |
| E08 | Performance budget | BLOCKED | No Lighthouse runner or fixed device environment was available. |
| E09 | External latency | BLOCKED | A DeepSeek server integration exists, but no live request or latency measurement was made in this regression; deterministic fixture timing is not reported as real latency. |
| E10 | Auth/request protection | BLOCKED | A local API server exists, but it trusts a shared demo identity and lacks production authentication/account isolation, CSRF protections, and rate limiting. |
| V01 | Global frame | BLOCKED | Browser screenshot comparison unavailable. |
| V02 | Card crop and fields | BLOCKED | Browser screenshot comparison unavailable. |
| V03 | Chat reading column/composer | BLOCKED | Browser screenshot comparison unavailable. |
| V04 | Color tokens/no white SaaS canvas | BLOCKED | Code tokens are present; rendered comparison unavailable. |
| V05 | Twelve stable portraits | BLOCKED | Files exist and dimensions were checked; rendered crop/source comparison unavailable. |
| V06 | Responsive behavior | BLOCKED | Requires desktop/tablet/mobile screenshots. |
| V07 | Reference comparison | BLOCKED | Reference URLs were not stable and no paired comparison image exists. |
| V08 | Screenshot regression | BLOCKED | No first approved golden screenshot exists. |

## Automated evidence

- `npm run typecheck` — PASS
- `npm test` — PASS, 3 files / 15 tests (includes an isolated local HTTP test for public character response fields and draft visibility)
- `npm run build` — PASS
- Automated tests cover domain recovery/quota/memory/fixture behavior and monthly/yearly pricing calculations.

## Real-service blockers

Real authentication, account isolation, hosted persistence, provider-native streaming, summary/memory service, payment verification, webhook idempotency, entitlement expiry, performance budget, and production request security require authorized external configuration. The server can call a configured DeepSeek provider, but no live model call was made for this acceptance pass. The app labels billing as demo/simulated and the checkout explicitly says no charge or entitlement change occurs.
