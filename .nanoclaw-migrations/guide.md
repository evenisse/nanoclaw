# NanoClaw Migration Guide

Generated: 2026-04-19
Base: 57ad3591a15303cbfee6c9424ad95ea4f57672c2
HEAD at generation: 7f843f59a866d9f4a855633615fa982265e03ce1
Upstream branch: v2
Upstream HEAD at generation: 57ad3591a15303cbfee6c9424ad95ea4f57672c2

---

## Applied Skills

All skills ship inside upstream/v2 directly — no separate skill branch merges needed.
The `.claude/skills/` directory is part of the upstream/v2 checkout.

## Skill Interactions

No conflicts detected between installed skill branches.

---

## Customizations

### Telegram channel integration

**Intent:** Add a Telegram bot channel with a custom pairing mechanism that requires the operator to echo a 4-digit code from the chat they're registering, preventing unauthorized registration of chats with a leaked bot token.

**Files:**
- `src/channels/telegram.ts` (new)
- `src/channels/telegram-pairing.ts` (new)
- `src/channels/telegram-markdown-sanitize.ts` (new)
- `src/channels/telegram-markdown-sanitize.test.ts` (new)
- `src/channels/telegram-pairing.test.ts` (new)
- `src/channels/index.ts` (add import)
- `package.json` (add dep)

**How to apply:**

1. Add dependency: `@chat-adapter/telegram@4.26.0` (pin exact version)

2. Copy `src/channels/telegram.ts`, `src/channels/telegram-pairing.ts`, `src/channels/telegram-markdown-sanitize.ts` and their test files from the main tree into the new checkout.

3. In `src/channels/index.ts`, add the auto-registration import:
   ```typescript
   import './telegram.js';
   ```

4. **Pairing flow** (`telegram-pairing.ts`):
   - Generates one-time 4-digit codes stored in `data/telegram-pairings.json`
   - Supports multiple pairing intents: `'main'` or `{ kind: 'wire-to'|'new-agent'; folder: string }`
   - Message must be exactly 4 digits (optionally prefixed by `@botname ` for groups)
   - On match: records chat, upserts user, auto-promotes to owner if instance has no owner
   - Storage: JSON file with in-process mutex lock (single-process safety)
   - Attempt tracking: caps failures per record at 10 attempts

5. **Telegram adapter** (`telegram.ts`):
   - Uses `createTelegramAdapter` from `@chat-adapter/telegram` with polling mode
   - Wraps `onInbound` with pairing interceptor that runs before message routing
   - Retry logic: exponential backoff (1s → 16s), max 5 attempts for cold-start DNS issues
   - Fetches bot username via Telegram API `getMe` endpoint (cached)
   - Creates Chat SDK bridge with custom text transform using the markdown sanitizer
   - Fail-open design: pairing errors don't break normal message flow
   - Environment variable: `TELEGRAM_BOT_TOKEN` (required)

6. **Markdown sanitizer** (`telegram-markdown-sanitize.ts`):
   - Workaround for `@chat-adapter/telegram` hardcoding legacy Markdown mode
   - Converts CommonMark `**bold**` → legacy `*bold*` and `__italic__` → `_italic_`
   - Replaces list bullets (`- item`) with Unicode bullet (`•`) to prevent unbalanced asterisks
   - Protects code spans (backticks, fenced blocks) from conversion
   - Strips unbalanced formatting chars to prevent Telegram rejection

---

### Discord channel integration

**Intent:** Add Discord bot support via the standardized Chat SDK adapter pattern.

**Files:**
- `src/channels/discord.ts` (new)
- `src/channels/index.ts` (add import)
- `package.json` (add dep)

**How to apply:**

1. Add dependency: `@chat-adapter/discord@4.26.0` (pin exact version)

2. Copy `src/channels/discord.ts` from the main tree.

3. In `src/channels/index.ts`, add:
   ```typescript
   import './discord.js';
   ```

4. The adapter extracts reply references via `referenced_message`, enables concurrent message processing and thread support.

5. Environment variables: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`

---

### Dashboard integration

**Intent:** Provide real-time visibility into agent groups, sessions, channels, users, and message activity via the `@nanoco/nanoclaw-dashboard` web UI. Optional — only activates when `DASHBOARD_SECRET` is set.

**Files:**
- `src/dashboard-pusher.ts` (new, ~581 lines)
- `src/index.ts` (add conditional startup)
- `src/config.ts` (add config exports)
- `package.json` (add dep)

**How to apply:**

1. Add dependency: `@nanoco/nanoclaw-dashboard@^0.3.0`

2. Copy `src/dashboard-pusher.ts` from the main tree (it collects snapshots from existing DB queries and POSTs them to `http://127.0.0.1:{DASHBOARD_PORT}/api/ingest`).

3. In `src/config.ts`, add the new exported constants:
   ```typescript
   export const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET ?? '';
   export const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 3100);
   ```

4. In `src/index.ts`, add conditional dashboard startup after service init:
   ```typescript
   import { startDashboard } from '@nanoco/nanoclaw-dashboard';
   import { startDashboardPusher } from './dashboard-pusher.js';
   import { DASHBOARD_SECRET, DASHBOARD_PORT } from './config.js';

   // ... at startup:
   if (DASHBOARD_SECRET) {
     startDashboard({ port: DASHBOARD_PORT, secret: DASHBOARD_SECRET });
     startDashboardPusher({ port: DASHBOARD_PORT, secret: DASHBOARD_SECRET, intervalMs: 60000 });
   }
   ```

5. **Key behaviours of `dashboard-pusher.ts`:**
   - `startDashboardPusher(config)`: initializes with 60s interval, immediate push on start
   - `stopDashboardPusher()`: cleanup on shutdown (wire into graceful shutdown)
   - Snapshot covers: agent groups, sessions, channels, users, token usage, context windows, activity, message queue depths
   - Log streaming: tails `logs/nanoclaw.log`, sends last 200 lines as backfill, polls every 2s for new lines, strips ANSI codes, handles rotation

---

### OneCLI API key passthrough

**Intent:** Enable authenticated OneCLI requests by passing an API key to the OneCLI constructor.

**Files:** `src/container-runner.ts`, `src/config.ts`

**How to apply:**

1. In `src/config.ts`, add:
   ```typescript
   export const ONECLI_API_KEY = process.env.ONECLI_API_KEY ?? '';
   ```

2. In `src/container-runner.ts`, import `ONECLI_API_KEY` from config and pass it to the `OneCLI` constructor:
   ```typescript
   import { ONECLI_API_KEY } from './config.js';
   // ...
   const onecli = new OneCLI({ apiKey: ONECLI_API_KEY });
   ```

---

### ISO 8601 datetime standardization in SQLite

**Intent:** Ensure all timestamps stored in SQLite are ISO 8601 UTC (with milliseconds), preventing timezone ambiguity.

**Files:**
- `container/agent-runner/src/db/messages-in.ts`
- `container/agent-runner/src/db/messages-out.ts`
- `src/db/session-db.ts`
- `src/modules/scheduling/db.ts`

**How to apply:**

Across all four files, replace every occurrence of `datetime('now')` with `strftime('%Y-%m-%dT%H:%M:%fZ','now')`.

This affects: `process_after` comparisons, `deliver_after` comparisons, status tracking inserts (`processing_ack`, delivered records), and task scheduling.

---

### French documentation

**Intent:** User-maintained French documentation covering the full NanoClaw architecture. Not required for functionality.

**Files:** `my-docs/` (11 `.md` files)

**How to apply:**

Copy the entire `my-docs/` directory from the main tree as-is.
