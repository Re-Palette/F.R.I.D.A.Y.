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
- Provider-agnostic LLM layer (`src/lib/llm/`) with a model router that
  maps task kinds to cost tiers (low/standard/high), currently backed by
  Anthropic.
- **Agent Loop** (`src/lib/agents/loop.ts`): the Main Agent's
  Observe→Plan→Act→Evaluate loop, bounded by step/timeout/token/cost
  guardrails and recorded to `agent_runs`. Delegation to sub-agents happens
  through tool calls (Anthropic's orchestrator-worker pattern), not a
  separate hardcoded router.
  - **Planning Agent** (`create_plan` tool) — decomposes a goal into
    subtasks, including work the user didn't explicitly ask for but that's
    genuinely needed (derived tasks), and persists them to `tasks`/`subtasks`.
  - **Research Agent** — uses Anthropic's server-side `web_search` /
    `web_fetch` tools (real page fetches, not just search snippets); every
    URL touched is persisted to `sources`. No extra API key needed beyond
    `ANTHROPIC_API_KEY`.
  - **Creation Agent** (`create_document` tool) — drafts a document, runs a
    self-verification pass (heuristics + an LLM checklist review) before
    saving, and only persists to `documents` once it passes.
- The hero screen's input starts a conversation that runs through the Agent
  Loop and persists every turn to Postgres (`src/lib/agents/main-agent.ts`,
  `src/app/api/chat/route.ts`). Tool-using turns can't token-stream (the
  model may pause mid-answer to call a tool), so the client-visible
  typewriter effect replays the completed answer in chunks — see the note
  in `route.ts`.

Not yet built: Schedule/Social/Browser agents, tool integrations
(Notion/Gmail/Calendar/Drive/Instagram/GitHub), the Approval Queue UI
(all current tools are Level 1/auto, so nothing needs it yet), background
scheduler/worker, and voice — these follow in Phases 4–8.

## Setup

1. `pnpm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `DATABASE_URL` — a Neon Postgres connection string.
   - `ANTHROPIC_API_KEY`.
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

## Scripts

- `pnpm dev` / `pnpm build` / `pnpm start`
- `pnpm lint`
- `pnpm db:generate` — generate SQL migrations from the Drizzle schema
- `pnpm db:migrate` — apply migrations to `DATABASE_URL`
- `pnpm db:studio` — browse the database
