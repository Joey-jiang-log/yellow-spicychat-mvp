# Yellow · SpicyChat-style MVP

An English-first, dark conversational character prototype with four routes:

- `/` — Discover characters
- `/chat/:characterId` — Conversation
- `/subscribe` — One-plan Premium checkout
- `/me` — Account, recent conversations, favorites, and subscription state

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

## GitHub updates

The intended remote is the private `yellow-spicychat-mvp` repository. After each demo change, pull the latest `main`, verify the change, review the staged files, commit, and push to `origin/main`. See [GitHub sync workflow](docs/github-workflow.md). Never add `sources/`, `.env`, user data, or build output.

## Demo boundary

This repository intentionally runs in `DEMO_MODE`. The UI and domain adapter are runnable without credentials:

- deterministic simulated streaming replies;
- localStorage persistence under `yellow-demo-state-v1`;
- one shared 20-reply free quota;
- one simulated `$9.99 / month` Premium plan with 1,000 replies;
- local demo login and server-boundary-shaped checkout flow.

No real authentication, LLM, database, webhook, or payment provider is configured. The demo checkout is not a real charge and must not be described as production billing. See [implementation status](docs/implementation-status.md), [acceptance report](docs/acceptance-report.md), and [visual diff](docs/visual-diff.md).

## Scope guardrails

The MVP excludes character detail pages, creator tools, rankings, multiple plans, voice, image generation, and production launch work. All character art in `public/characters/` is original generated demo material.
