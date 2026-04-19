# NanoClaw Migration Guide

Generated: 2026-04-19
Base: 71aab8c3166cc2b935c4f14d5c36bfdf2c682e70
HEAD at generation: 76b1abbad02796a278bfc8b26abcf640d4899943
Upstream branch: v2
Upstream HEAD at generation: 96d765611230e7f4026126c0a92fa3dd4090fa16

---

## Applied Skills

All skills ship inside upstream/v2 directly — no separate skill branch merges needed.
The `.claude/skills/` directory is part of the upstream/v2 checkout.

## Skill Interactions

No conflicts detected between installed skill branches.

---

## Notes on DB File Relocations (upstream refactor)

Upstream/v2 moved several DB files as part of the modules refactor:
- `src/db/agent-destinations.ts` → `src/modules/agent-to-agent/db/agent-destinations.ts`
- `src/db/agent-group-members.ts` → `src/modules/permissions/db/agent-group-members.ts`
- `src/db/user-dms.ts` → `src/modules/permissions/db/user-dms.ts`
- `src/db/user-roles.ts` → `src/modules/permissions/db/user-roles.ts`
- `src/db/users.ts` → `src/modules/permissions/db/users.ts`

When applying customizations, update imports accordingly.

---

## Customizations

### Fix timestamps ISO 8601 in session DBs

**Intent:** All auto-generated SQLite timestamps use `strftime('%Y-%m-%dT%H:%M:%fZ','now')` instead of `datetime('now')` for consistency with ISO 8601. This was needed to make dashboard display consistent since channel adapters already emit ISO 8601.

**Files:**
- `container/agent-runner/src/db/messages-in.ts`
- `container/agent-runner/src/db/messages-out.ts`
- `src/db/session-db.ts`
- `src/modules/scheduling/db.ts`

**How to apply:**

Replace every occurrence of `datetime('now')` in SQL strings with `strftime('%Y-%m-%dT%H:%M:%fZ','now')` in all four files (skip test files and migration schema defaults).

---

### ONECLI_API_KEY forwarding to OneCLI SDK

**Intent:** Read `ONECLI_API_KEY` from `.env` and forward it to the OneCLI SDK so containers are initialized with authenticated credentialed config.

**Files:** `src/config.ts`, `src/container-runner.ts`

**How to apply:**

1. In `src/config.ts`, add `'ONECLI_API_KEY'` to the `readEnvFile([...])` call, then export:
   ```typescript
   export const ONECLI_API_KEY = process.env.ONECLI_API_KEY || envConfig.ONECLI_API_KEY;
   ```

2. In `src/container-runner.ts`, import `ONECLI_API_KEY` from `./config.js` and pass it when constructing the OneCLI client:
   ```typescript
   const onecli = new OneCLI({ url: ONECLI_URL, apiKey: ONECLI_API_KEY });
   ```

---

### Telegram channel adapter

**Intent:** Full Telegram integration via Chat SDK bridge. Includes: retry/backoff for cold-start webhook registration, a **4-digit pairing protocol** (operator sends a code to link a Telegram chat to an agent group), and a Markdown sanitizer to fix the legacy `parse_mode=Markdown` behavior of `@chat-adapter/telegram`.

**Files:**
- `src/channels/telegram.ts` — main adapter + retry + webhook
- `src/channels/telegram-pairing.ts` — pairing state machine
- `src/channels/telegram-markdown-sanitize.ts` — CommonMark → Telegram legacy Markdown converter
- `src/channels/telegram-pairing.test.ts` — tests for pairing
- `src/channels/telegram-markdown-sanitize.test.ts` — tests for sanitizer

**How to apply:**

1. Copy all 5 files into `src/channels/`.

2. Update imports in `telegram.ts` to use the new DB file locations (post-upstream refactor):
   ```typescript
   import { grantRole, hasAnyOwner } from '../modules/permissions/db/user-roles.js';
   import { upsertUser } from '../modules/permissions/db/users.js';
   ```

3. In `src/channels/index.ts`, add:
   ```typescript
   import './telegram.js';
   ```

4. Required env var: `TELEGRAM_BOT_TOKEN`.
5. Pairing state persisted in `data/telegram-pairings.json` (runtime, never touched during migration).

---

### Discord channel adapter

**Intent:** Discord integration via Chat SDK bridge. Simpler than Telegram — no pairing protocol, no retry logic.

**Files:** `src/channels/discord.ts`

**How to apply:**

1. Copy `src/channels/discord.ts` into the new tree.

2. In `src/channels/index.ts`, add:
   ```typescript
   import './discord.js';
   ```

3. Required env var: `DISCORD_BOT_TOKEN`. Optional: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`.

---

### Dashboard state pusher

**Intent:** Push periodic system state snapshots to the `@nanoco/nanoclaw-dashboard` monitoring UI. Enabled conditionally when `DASHBOARD_SECRET` is set in `.env`. State collected every 60 seconds.

**Files:**
- `src/dashboard-pusher.ts` — state collector (581 lines)
- `src/config.ts` — DASHBOARD_SECRET + DASHBOARD_PORT exports
- `src/index.ts` — conditional init

**How to apply:**

1. Copy `src/dashboard-pusher.ts` into the new tree.

2. Update imports in `dashboard-pusher.ts` to use new DB file locations:
   ```typescript
   import { getDestinations } from './modules/agent-to-agent/db/agent-destinations.js';
   import { getMembers } from './modules/permissions/db/agent-group-members.js';
   import { getAllUsers, getUser } from './modules/permissions/db/users.js';
   import { getUserRoles, getAdminsOfAgentGroup } from './modules/permissions/db/user-roles.js';
   import { getUserDmsForUser } from './modules/permissions/db/user-dms.js';
   ```

3. In `src/config.ts`, add to `readEnvFile([...])`: `'DASHBOARD_SECRET'`, `'DASHBOARD_PORT'`, and export:
   ```typescript
   export const DASHBOARD_SECRET = process.env.DASHBOARD_SECRET || envConfig.DASHBOARD_SECRET;
   export const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || envConfig.DASHBOARD_PORT || '3100', 10);
   ```

4. In `src/index.ts`, add conditional init before `log.info('NanoClaw running')`:
   ```typescript
   import { DASHBOARD_SECRET, DASHBOARD_PORT } from './config.js'; // add to existing import

   // In main():
   if (DASHBOARD_SECRET) {
     const { startDashboard } = await import('@nanoco/nanoclaw-dashboard');
     const { startDashboardPusher } = await import('./dashboard-pusher.js');
     startDashboard({ port: DASHBOARD_PORT, secret: DASHBOARD_SECRET });
     startDashboardPusher({ port: DASHBOARD_PORT, secret: DASHBOARD_SECRET, intervalMs: 60000 });
   } else {
     log.info('Dashboard disabled (no DASHBOARD_SECRET)');
   }
   ```

---

### Dependencies

**Intent:** Add npm packages for Telegram, Discord, and dashboard integrations.

**Files:** `package.json`

**How to apply:**

Add to `dependencies`:
```json
"@chat-adapter/discord": "^4.26.0",
"@chat-adapter/telegram": "4.26.0",
"@nanoco/nanoclaw-dashboard": "^0.3.0"
```

Note: `@chat-adapter/telegram` is pinned at exact version `4.26.0` — the pairing protocol depends on specific internal behavior.

---

### Personal architecture documentation (my-docs/)

**Intent:** French-language internal reference guide covering all NanoClaw v2 subsystems (11 documents). Personal reference.

**Files:** `my-docs/` directory (all files)

**How to apply:** Copy `my-docs/` verbatim from the source tree.
