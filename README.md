# F.R.I.D.A.Y.

Personal Autonomous AI Agent — Personal Intelligence Operating System.

Not a chatbot: a single-user agent that understands a goal, breaks it into
work, delegates to specialized agents, uses tools, verifies its own output,
and asks for approval only when it matters. See the project's architecture
proposal (shared in the original planning conversation) for the full design.

## Status

**Phase 1 (Foundation), Phase 2 (Core AI), and Phase 3 (Agent System).**
What exists today:

- Next.js 16 / React 19 / TypeScript / Tailwind v4 project, single dark
  theme derived from the reference design (see `src/app/globals.css` for
  tokens, `src/components/ui/` for base components).
- Neon PostgreSQL schema via Drizzle ORM (`src/lib/db/schema/`) covering
  users, conversations, messages, memories (pgvector-ready), projects,
  tasks/subtasks, events, documents/sources, tool_connections, agent_runs,
  approvals, drafts, activity_logs.
- **No authentication** (explicit choice): this deployment has no login
  step. Anyone who can reach the deployed URL uses it as the single owner
  identified by `ALLOWED_EMAIL` (a label, not a gate). Google OAuth
  (Auth.js v5) was built and then removed at the owner's request after
  weighing the exposure/cost risk — see git history if you want it back.
- Provider-agnostic LLM layer (`src/lib/llm/`) backed by **Anthropic Claude**
  (`src/lib/llm/anthropic.ts`). Claude Code is only the dev tool building
  this app — the deployed app makes its own Anthropic API calls with its
  own key. The `LLMProvider` abstraction (generic `ContentBlock`s) is what
  lets the provider be swapped later without touching any Agent code.
- **Model Router — "Cheap by Default, Powerful When Necessary"**
  (`src/lib/llm/router.ts`): every task kind maps to a `fast`/`default`/
  `powerful` tier; `fast`/`default` both default to Haiku (the cheapest
  current Claude tier), `powerful` to Opus. The Main Loop's own
  orchestration (deciding *whether* to call a tool) always runs on `fast` —
  the actual heavy lifting for a task happens inside that tool's own nested
  call, at a tier chosen by a `complexity`/`importance` argument the
  orchestrator sets *as part of the tool call it's already making* (see
  `create-plan.ts`/`create-document.ts`), so tiering costs zero extra LLM
  calls. `FORCE_MODEL_TIER=fast` forces everything cheap for dev/testing.
- **Agent Loop** (`src/lib/agents/loop.ts`): the Main Agent's
  Observe→Plan→Act→Evaluate loop, bounded by step/timeout/token/cost
  guardrails. Delegation to sub-agents happens through tool calls (an
  orchestrator-worker pattern) — a simple question never triggers
  Planning/Research/Creation; the model only reaches for a tool when the
  request actually needs one.
  - **Planning Agent** (`create_plan` tool) — decomposes a goal into
    subtasks, including work the user didn't explicitly ask for but that's
    genuinely needed (derived tasks), persisted to `tasks`/`subtasks`.
  - **Research Agent** — uses Anthropic's server-side `web_search`/
    `web_fetch` tools (real page fetches, not just snippets); every URL
    touched is persisted to `sources`. No extra API key beyond
    `ANTHROPIC_API_KEY`. These tools run server-side, so there's no
    client-side hook to cache/dedupe a query before it's sent — the loop's
    step/cost guardrails bound the worst case instead (see the note in
    `research.ts`).
  - **Creation Agent** (`create_document` tool) — takes a *brief*, not
    pre-written prose: drafts the content itself (at the tier `importance`
    calls for), then a self-verification pass (heuristics + an LLM
    checklist review) before saving; refuses to persist a draft that fails.
    `destination: "notion"` additionally publishes the (already-verified)
    content as a page in a connected Notion workspace
    (`src/lib/integrations/notion.ts`) — falls back to local-only with a
    note in the result if Notion isn't configured. First real external
    tool integration (Phase 4).
  - **Google Calendar** (read-only) — the Master Brief §3 flagship example
    is real now: "明日の予定ある？"/"今日の予定ある？" is caught by a
    **deterministic intent detector** (`src/lib/agents/intent.ts`) and
    never reaches the model at all — it goes straight to the Calendar API
    and formats the real result. Any other date/range goes through the
    `get_calendar_events` tool instead (still real data, just via the
    Agent Loop). Reads every calendar the user actually sees — shared and
    subscribed ones included, across as many Google accounts as are
    configured (`GOOGLE_CALENDAR_REFRESH_TOKEN`, `..._2`, ...), skipping
    Google's generated holiday/birthday calendars and anything unticked in
    Google Calendar. No in-app login: since FRIDAY has none, a refresh
    token is minted once per account via `pnpm calendar:get-token`
    (`src/lib/integrations/google-calendar.ts`) and stored as an env var.
- **Cost monitoring**: every LLM call in a run — the orchestrator's own
  turns *and* nested calls inside tools — is recorded to a shared
  `CostTracker` (`src/lib/agents/cost-tracker.ts`) and persisted onto that
  run's `agent_runs` row (`llm_calls` jsonb with per-call model/tokens/cost,
  plus `api_call_count`, `tokens_used`, `cost_usd`, `started_at`/`ended_at`)
  — the data a future "today/this month/per-agent" cost dashboard reads
  from, without re-deriving anything.
- The hero screen's input starts a conversation that runs through the Agent
  Loop and persists every turn to Postgres (`src/lib/agents/main-agent.ts`,
  `src/app/api/chat/route.ts`). Tool-using turns can't token-stream (the
  model may pause mid-answer to call a tool), so the client-visible
  typewriter effect replays the completed answer in chunks — see the note
  in `route.ts`.

Not yet built: Schedule/Social/Browser agents, remaining tool integrations
(Gmail/Drive/Instagram/GitHub — Gmail in particular needs the Approval
Queue below it first, since sending mail is Level 2), the Approval Queue
UI (all current tools are Level 1/auto, so nothing needs it yet), semantic
memory/research caching (the Memory tables exist but retrieval isn't wired
up), background scheduler/worker, and voice — these follow in Phases 4–8.

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — a Neon Postgres connection string.
   - `ANTHROPIC_API_KEY`. The model router's default model IDs
     (`ANTHROPIC_FAST_MODEL`/`ANTHROPIC_DEFAULT_MODEL`/`ANTHROPIC_POWERFUL_MODEL`)
     default to Haiku/Haiku/Opus — override via env vars only if you want a
     different split, no code change needed either way.
   - `ALLOWED_EMAIL` — labels the single owner row; not an access gate (see
     the Status note above — there is no login).
   - `NOTION_API_KEY`/`NOTION_PARENT_PAGE_ID` — optional; see the comments in
     `.env.example` for how to create the integration and get the page ID.
     Without these, `create_document`'s Notion destination just falls back
     to saving locally.
   - `GOOGLE_CALENDAR_CLIENT_ID`/`GOOGLE_CALENDAR_CLIENT_SECRET`/
     `GOOGLE_CALENDAR_REFRESH_TOKEN` — optional; see `.env.example` for the
     one-time setup (`pnpm calendar:get-token`), including how to add a
     second account as `GOOGLE_CALENDAR_REFRESH_TOKEN_2`. Without these,
     calendar questions just get told it's not connected.
3. Create the tables (only needed for local dev against a real DB — Vercel
   does this automatically on deploy, see below). `db:migrate` enables
   pgvector and applies the migrations in one step:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```
4. `pnpm dev` and open http://localhost:3000.

## Deploying (Vercel)

**Migrations run automatically on every Vercel deploy.** `package.json`
defines a `vercel-build` script (Vercel uses it in place of `build`
automatically, no dashboard config needed) that runs `scripts/migrate.ts`
— enabling pgvector and applying migrations over Neon's HTTP driver, the
same transport the app itself uses — before `next build`. Generated SQL
under `drizzle/` is committed to the repo; only `pnpm db:generate` needs to
run locally (schema-only, no DB connection) whenever `src/lib/db/schema/`
changes, then commit the result. Local `pnpm dev`/`pnpm build` are
unaffected — they still don't touch the database, on the same
lazy-init/build-doesn't-need-secrets basis as before.

If `DATABASE_URL` isn't set, the migration step logs a warning and the
build continues: a build with no database configured has nothing to
migrate, and a missing env var must not take down compilation (Preview
deployments in particular often have a narrower variable list than
Production — see below). A `DATABASE_URL` that *is* set but unreachable,
or a migration that fails to apply, still fails the build, so code never
ships against a schema that didn't get updated.

**This deployment has no login.** Anyone with the URL can read every
conversation/document and can spend your `ANTHROPIC_API_KEY` quota by
hitting `/api/chat` directly — there is no per-request identity check to
rate-limit against. If that's not what you want, the two safer options
(re-add real auth, or gate behind a single shared passcode) are a smaller
change than it sounds; ask before assuming this is fine for a URL anyone
might find.

Set every var from `.env.example` (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
`ALLOWED_EMAIL`; the `ANTHROPIC_*_MODEL`/`FORCE_MODEL_TIER`/Notion vars are
optional) in the Vercel project's **Settings → Environment Variables**, for
whichever environment you're deploying (Production/Preview/Development
each have their own list — a var set only under Production won't exist
during a Preview build). None of these are required for `next build` to
*succeed* (see the note in `src/lib/db/client.ts` — checked lazily at first
real use, not at import time), but the deployed app won't do anything
useful without `DATABASE_URL`/`ANTHROPIC_API_KEY` set.

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint`
- `pnpm db:generate` — generate SQL migrations from the Drizzle schema
  (offline; needs no database connection)
- `pnpm db:migrate` — enable pgvector and apply migrations to `DATABASE_URL`
- `pnpm db:studio` — browse the database
- `pnpm calendar:get-token` — one-time local OAuth flow to print a Google
  Calendar refresh token (see `.env.example`)
