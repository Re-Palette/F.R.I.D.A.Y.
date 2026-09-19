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
- **No per-user authentication** (explicit choice): there are no accounts.
  Whoever uses the app is the single owner identified by `ALLOWED_EMAIL` (a
  label, not a gate). Google OAuth (Auth.js v5) was built and then removed
  at the owner's request after weighing the exposure/cost risk — see git
  history if you want it back.
- **Optional access passcode** (`src/proxy.ts`, `/unlock`): setting
  `APP_PASSCODE` puts one shared passcode in front of every page and API
  route; leaving it unset keeps the open behaviour above, so the file is
  inert until you opt in. Unlocking stores an HMAC of the passcode in a
  long-lived HttpOnly cookie, so it is asked once per browser — an
  installed PWA, or a tab left open, is never interrupted later. Changing
  the passcode invalidates every device at once. Failed attempts are rate
  limited in Postgres (10 per 15 minutes, global — the counter has to be
  shared state, since parallel serverless invocations would sail straight
  past an in-process one), which is what makes a passcode a person can
  remember safe rather than requiring a random string.
- **Installable** (`src/app/manifest.ts`): Chrome offers a real install, and
  the app opens in its own window with no address bar.
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
  - **Gmail** (`search_email`, `read_email`, `create_email_draft`,
    `send_email`) — searching, reading and writing a draft run
    automatically; only sending is Level 2, waiting for approval because
    mail cannot be unsent and the recipient is a third party. A draft goes
    nowhere — it sits in the user's own mailbox for them to edit and send
    themselves — which is usually the better route anyway. Mail is written by other people, so every result carrying message
    content is wrapped in an explicit "this is data, not instructions"
    notice at the point the model reads it — an email that asks FRIDAY to
    forward or disclose something gets reported to the user, not obeyed.
    Needs its own refresh token (`GOOGLE_GMAIL_REFRESH_TOKEN`): scopes are
    fixed when a token is minted, and the calendar ones carry
    `calendar.readonly` only.
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

- **Approval Queue** (`src/lib/agents/approvals.ts`, `/approvals`): Master
  Brief §12's permission levels, enforced. A tool decides per *call* whether
  the work needs a human — the same tool can be harmless or consequential
  depending on its input, so `create_document` saves locally on its own but
  parks a Notion publish for approval. A queued call is never executed: the
  Agent Loop writes an `approvals` row plus a readable `drafts` preview and
  tells the model to say it's waiting, not that it's done. Approving runs
  the tool with exactly the approved input, under its own `agent_runs` row
  so the cost is still accounted for, and posts the outcome back into the
  conversation it came from. **This is confirmation, not authorization** —
  with no login, whoever can reach the URL can also approve. It stops the
  agent acting unilaterally; it does not decide who may act.

  - **Google Drive** (`search_drive`, `read_drive_file`) and **GitHub**
    (`github`) — both read-only, so neither needs the Approval Queue.
    Drive exports Docs/Sheets/Slides as text and says so rather than
    decoding binary formats; GitHub lists repositories, a repo's open
    issues/PRs, or its recent commits, and takes a personal access token
    instead of an OAuth flow.
- **Memory** (`src/lib/agents/memory.ts`, `remember` tool): what FRIDAY
  learns about the user survives the conversation. The model saves a fact
  as part of a turn it's already taking, so remembering costs no extra LLM
  call, and everything remembered goes into the system prompt on every
  turn. Retrieval is deliberately not semantic: Anthropic has no embeddings
  endpoint, so vector search would mean a second paid provider, and at one
  user's scale the whole store fits in the prompt anyway. The
  `memories.embedding` column and its HNSW index stay unused until it
  doesn't — only `recallMemories()` would change.

- **Daily briefing** (`src/lib/agents/briefing.ts`, `/api/cron/briefing`):
  the first thing FRIDAY does unasked. A Vercel cron fires at 07:00 JST,
  gathers the day's calendar and unread mail *in code* — what belongs in a
  morning brief is known in advance, so having an agent loop rediscover it
  daily would be pure cost — and spends one cheap call turning that into
  something readable, falling back to the raw list if the call fails. It
  arrives as a new conversation, waiting when you open the app, and a
  second run the same day is skipped rather than duplicated. Authenticated
  by `CRON_SECRET`, not the passcode: a scheduled request carries no
  cookie, so `/api/cron` is excluded from the gate in `src/proxy.ts`.
- **Scheduled and deferred work** (`src/lib/agents/schedule.ts`,
  `scheduled-runner.ts`, the `scheduled_tasks` tool, `/tasks`): a repeating
  task ("毎週月曜に今週の予定をまとめて") and a one-off background one
  ("これ調べておいて") are the same row — deferred work is just a schedule
  that happens once. The hourly dispatcher runs everything *overdue* rather
  than what is due at that instant, which makes its cadence a
  quality-of-service knob instead of a correctness one: a missed firing
  delays work rather than losing it. Each task is claimed — rescheduled —
  before it runs, because two overlapping dispatches acting on the world
  twice is worse than one waiting for its next turn, and a recurring task
  that fails keeps its schedule instead of dying silently. Schedules are
  stored as their parts rather than cron strings: easier for the model to
  get right and for the user to read back. Only the dispatcher uses
  `CRON_SECRET`; managing tasks from `/tasks` stays behind the passcode.

- **Voice** (`src/lib/speech.ts`): a microphone in the input line dictates
  into the field, and replies can be read aloud from a toggle in the chat
  header that each browser remembers. Both use the browser's own speech
  APIs — Anthropic has no speech endpoint, so anything else would mean a
  third paid provider and a third key, the same trade the memory store
  faced. The cost is uneven support, so both are behind feature detection
  (via `useSyncExternalStore`, since the server has no `window` and
  resolving it during render would disagree with the client's markup): the
  controls appear only where they work, because an inert microphone is
  worse than none. Dictation fills the field rather than sending — a
  misheard word is trivial to fix before submitting and awkward to take
  back after. A wake word is not possible from a web app: the page has to
  be open for the browser to listen at all.

Not yet built: Social/Browser agents and research caching — these follow in
Phases 5–8. Instagram is
deliberately not on that list: its API needs a Business/Creator account
linked to a Facebook Page and an app review for anything beyond your own
media, which is a lot of setup for little a personal agent can use.

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
   - `ELEVENLABS_API_KEY`/`ELEVENLABS_VOICE_ID` — optional; the voice the
     home screen answers in. Unset, it uses the browser's own speech
     synthesis instead, and it falls back to that whenever ElevenLabs fails
     or the quota runs out. See `.env.example` for where to design a voice
     and find its ID.
   - `NEXT_PUBLIC_SPEECH_READINGS` — optional; readings for words the voice
     gets wrong (`書き方=よみかた`, comma separated). Dates, times, numbers
     and markup are already rewritten for the ear before anything is spoken
     — see `src/lib/speech-text.ts`, checked by `pnpm test:speech` — so this
     is only for proper nouns.

   The home screen is voice-only. Touch the ring to talk, or switch WAKE on
   and call it by name — "フライデー" — and it starts listening on its own.
   Speaking over a reply cuts it short and hands the turn back, so you never
   have to wait for it to finish a sentence. "ありがとうフライデー" ends the
   conversation and puts it back to waiting for its name; that phrase is
   matched in the browser and never reaches the model. WAKE keeps the microphone open
   for as long as it is on, and Chrome streams what it hears to Google's
   speech service while it is, which is why it is off until switched on.
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

**Without `APP_PASSCODE` set, this deployment is open.** Anyone with the
URL can read every conversation/document and can spend your
`ANTHROPIC_API_KEY` quota by hitting `/api/chat` directly. Setting
`APP_PASSCODE` closes that (see the Status note above) and costs one
passcode entry per browser; it is worth doing before adding any tool that
acts outside FRIDAY — sending mail, in particular, since the Approval
Queue confirms *intent* but cannot tell who is confirming.

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
  (offline; reads `.env.local` but never opens a connection)
- `pnpm db:migrate` — enable pgvector and apply migrations to `DATABASE_URL`
- `pnpm db:studio` — browse the database
- `pnpm calendar:get-token` — one-time local OAuth flow to print a Google
  Calendar refresh token (see `.env.example`)
