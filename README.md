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
- Single-user auth (Auth.js v5, Google OAuth, gated by `ALLOWED_EMAIL`).
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
  - **Deterministic intent hook** (`src/lib/agents/intent.ts`) — checked
    before any LLM call at all, for messages a direct API can answer
    without a model (e.g. a future "明日の予定ある？" → Google Calendar).
    No detectors are registered yet since no external services are
    connected; this is Phase 4's extension point.
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

Not yet built: Schedule/Social/Browser agents, real tool integrations
(Notion/Gmail/Calendar/Drive/Instagram/GitHub — and the deterministic
intent detectors that ride on them), the Approval Queue UI (all current
tools are Level 1/auto, so nothing needs it yet), semantic memory/research
caching (the Memory tables exist but retrieval isn't wired up), background
scheduler/worker, and voice — these follow in Phases 4–8.

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — a Neon Postgres connection string.
   - `ANTHROPIC_API_KEY`. The model router's default model IDs
     (`ANTHROPIC_FAST_MODEL`/`ANTHROPIC_DEFAULT_MODEL`/`ANTHROPIC_POWERFUL_MODEL`)
     default to Haiku/Haiku/Opus — override via env vars only if you want a
     different split, no code change needed either way.
   - `AUTH_SECRET` (`npx auth secret`), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
     from a Google OAuth client.
   - `ALLOWED_EMAIL` — the only account permitted to sign in.
3. Enable pgvector and create the tables:
   ```bash
   pnpm db:enable-extensions
   pnpm db:generate
   pnpm db:migrate
   ```
4. `pnpm dev` and open http://localhost:3000.

## Deploying (Vercel)

Set every var from `.env.example` (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
`AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL`; the
`ANTHROPIC_*_MODEL`/`FORCE_MODEL_TIER` overrides are optional) in the
Vercel project's **Settings → Environment Variables**, for whichever
environment you're deploying (Production/Preview/Development each have
their own list — a var set only under Production won't exist during a
Preview build). None of these are required for `next build` to *succeed*
(see the note in `src/lib/auth/index.ts` and `src/lib/db/client.ts` — both
are checked lazily at first real use, not at import time), but the deployed
app won't do anything useful without them: sign-in is denied and any
database query throws until they're set.

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint`
- `pnpm db:generate` — generate SQL migrations from the Drizzle schema
- `pnpm db:migrate` — apply migrations to `DATABASE_URL`
- `pnpm db:studio` — browse the database
