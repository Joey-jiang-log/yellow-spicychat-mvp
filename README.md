# Yellow · SpicyChat-style MVP

An English-first, dark conversational character prototype with integrated discovery, chat, pricing, account, and character-creation flows:

- `/discover` (also `/`) — Discover characters
- `/chat/:characterId` — Conversation
- `/create` — Create a character and save it in this browser
- `/recent` — Recent conversations
- `/pricing` (also `/subscribe`) — Plan comparison and checkout placeholder
- `/account` (also `/me`) — Account settings, created characters, favorites, and subscription state

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL printed by Vite. The production checks are:

```bash
npm run typecheck
npm test
npm run build
```

## Yellow Admin Console

The Yellow backend/admin MVP runs locally and calls DeepSeek V4.1 Flash for character chats:

```bash
npm run backend   # API on http://localhost:4174
npm run dev       # UI on http://localhost:4173
```

Open [http://localhost:4173/admin](http://localhost:4173/admin) and use the local admin token `yellow-dev-admin` (override it with `YELLOW_ADMIN_TOKEN`). The console supports Character CRUD, Draft/Online/Offline status, prompt/model settings, avatar and cover uploads, per-character image triggers, homepage placement, and Debug Chat.

The backend reads its secret configuration from the ignored `.env.local` file. Set `DEEPSEEK_API_KEY` there; user chats and Admin Debug Chat call `deepseek-flash` through `https://api.deepseek.com/chat/completions`, using each character's prompt, greeting, temperature, token limit, and recent conversation history. The key stays on the server. Characters and conversations persist to ignored `data/yellow.json`, and uploaded assets stay under `public/uploads/`. The public frontend reads online characters and Featured order from the API and reloads saved conversations after refresh. When the API is offline, the UI shows that status and falls back to the bundled demo fixtures.

## GitHub updates

The intended remote is the private `yellow-spicychat-mvp` repository. After each demo change, pull the latest `main`, verify the change, review the staged files, commit, and push to `origin/main`. See [GitHub sync workflow](docs/github-workflow.md). Never add `sources/`, `.env`, user data, or build output.

## Demo boundary

This repository keeps account and billing flows in `DEMO_MODE`; character chat uses the configured server-side DeepSeek model:

- simulated streaming presentation of DeepSeek replies;
- localStorage persistence under `yellow-demo-state-v1`;
- one shared 20-reply free quota;
- display-only monthly/yearly plan and credit-pack comparisons with a checkout placeholder;
- an isolated legacy demo quota model of 1,000 paid replies, which is not connected to the displayed tier cards;
- local demo login.

No real authentication, hosted database/account isolation, payment provider, or webhook is configured. A server-side DeepSeek integration can be enabled with `DEEPSEEK_API_KEY`; chat requests are not provider-streamed. Selecting a displayed tier or credit pack does not grant entitlements, and checkout does not charge a card. Do not describe this as production billing or private account storage. See [implementation status](docs/implementation-status.md), [acceptance report](docs/acceptance-report.md), and [visual diff](docs/visual-diff.md).

## Scope guardrails

The prototype excludes standalone character detail pages, rankings, voice, real image generation, real payments, and production launch work. Character creation, subscription tiers, credit packs, image preview, and checkout are demos. Demo sign-in uses the shared `demo-user` identity rather than real authentication; chat history is also written to the local API's JSON store. If `DEEPSEEK_API_KEY` is configured, chat text and character prompts are sent to DeepSeek. Replies are returned as a complete response and animated in chunks in the browser; this is not provider streaming. Do not use private or sensitive information in the shared demo. Plan/credit selections never charge a card or grant real provider access. All bundled character art in `public/characters/` is original generated demo material.
