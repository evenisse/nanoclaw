# NanoClaw Migration Guide

Generated: 2026-06-06T00:00:00Z
Base: 9e8f256dd2f857d4cf2825f624453e048642408d
HEAD at generation: 4c813a5861d5e24cfa697b24f25d0addb4c1dc18
Upstream at migration: d14472142d4ddcbb50e5f58ff09d63eb2f99bc20
Last upgraded to: d14472142d4ddcbb50e5f58ff09d63eb2f99bc20 (v2.0.76)

## Applied Skills

- `add-telegram` — from `origin/channels` branch (files: `src/channels/telegram.ts`, `telegram-markdown-sanitize.ts`, `telegram-pairing.ts` + tests)

Custom skills:
- `.claude/skills/add-my-dashboard/` — copy as-is from main tree (skill for installing the admin dashboard UI)

## Skill Interactions

None detected.

## Modifications to Applied Skills

None — Telegram files are identical to the `channels` branch. No further modifications.

## Customizations

### Gmail MCP server baked into container image

**Intent:** Install the Gmail MCP server globally in every agent container so agents can read, search, and send Gmail via MCP tools.

**Files:** `container/Dockerfile`, `container/agent-runner/src/providers/claude.ts`

**How to apply:**

1. In `container/Dockerfile`, add an ARG for the version (near the other version ARGs):
   ```dockerfile
   ARG GMAIL_MCP_VERSION=1.1.11
   ```

2. In `container/Dockerfile`, add a pnpm install block after the `claude-code` install block:
   ```dockerfile
   RUN --mount=type=cache,target=/root/.cache/pnpm \
       pnpm install -g \
           "@gongrzhe/server-gmail-autoauth-mcp@${GMAIL_MCP_VERSION}" \
           "zod-to-json-schema@3.22.5"
   ```

3. In `container/agent-runner/src/providers/claude.ts`, add `'mcp__gmail__*'` to the `TOOL_ALLOWLIST` array (after `'mcp__nanoclaw__*'`).
   **Note:** As of v2.0.55+, MCP tool patterns are generated dynamically from `Object.keys(this.mcpServers).map(mcpAllowPattern)` — no manual TOOL_ALLOWLIST entry needed.

### Configurable auto-compact window via env var

**Intent:** Allow `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to be set in the host environment without editing source.

**Note:** This was absorbed upstream as of v2.0.55+. `process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW || '165000'` is already in `container/agent-runner/src/providers/claude.ts`. No action needed on future upgrades.

### Pinned Vercel CLI version

**Intent:** Pin `VERCEL_VERSION` to `52.2.1` instead of `latest` for reproducible builds.

**Note:** Upstream adopted `52.2.1` as the pinned default. Already present in `container/Dockerfile`. No action needed on future upgrades.

### Deleted default group CLAUDE.md files

**Intent:** `groups/global/CLAUDE.md` and `groups/main/CLAUDE.md` (the default boilerplate agent configurations shipped with NanoClaw) were deleted. The user runs different named agent groups (`nano`, `_ping-test`) and does not use these defaults.

**Files:** `groups/global/CLAUDE.md`, `groups/main/CLAUDE.md` (data directory — not code)

**How to apply:**

After the swap, delete these two files if the upstream restored them:
```bash
rm -f groups/global/CLAUDE.md groups/main/CLAUDE.md
```

Note: `groups/` is a data directory. These files will be restored by `git reset --hard` during the swap step, so they must be manually deleted afterward.

### Astro/Starlight documentation site

**Intent:** User-maintained documentation site (French) covering architecture, guides, and tutorials for the local NanoClaw install. Pure docs — no runtime dependency.

**Files:** `docs-site/` directory (34 files, 23 pages), plus a page added later in `docs-site/src/content/docs/guides/monter-chemins-hote.md`

**How to apply:** Copy the entire `docs-site/` directory from the backup tag into the upgraded tree.
```bash
git checkout <backup-tag> -- docs-site/
```

### Configurable webhook server port (WEBHOOK_PORT)

**Intent:** Allow the webhook server port to be overridden via `WEBHOOK_PORT` in `.env`. Default is 3000. Needed when another service already occupies port 3000.

**Files:** `src/config.ts`, `src/webhook-server.ts`

**How to apply:**

1. In `src/config.ts`, add `'WEBHOOK_PORT'` to the `readEnvFile([...])` call (with the other env var names), then add the export:
   ```typescript
   export const WEBHOOK_PORT = parseInt(process.env.WEBHOOK_PORT || envConfig.WEBHOOK_PORT || '3000', 10);
   ```

2. In `src/webhook-server.ts`, replace the top-of-file `DEFAULT_PORT` constant and the inline `parseInt(process.env.WEBHOOK_PORT ...)` in `ensureServer()` with an import from config:
   ```typescript
   import { WEBHOOK_PORT } from './config.js';
   ```
   Then in `ensureServer()`, remove `const port = parseInt(process.env.WEBHOOK_PORT || String(DEFAULT_PORT), 10);` and use `WEBHOOK_PORT` directly in `server.listen(WEBHOOK_PORT, '0.0.0.0', ...)`.

### Telegram polling: reduced timeout to avoid Conflict cascade

**Intent:** Prevent an infinite Conflict-error loop on network drops. With the default 30 s timeout, a dropped connection leaves a pending `getUpdates` at Telegram for 30 s. The SDK's max retry backoff is also 30 s, so retries race against the old request. Setting `timeout: 10` and `retryDelayMs: 11000` ensures every retry arrives after the server-side hold clears.

**Files:** `src/channels/telegram.ts`

**How to apply:** In the `createTelegramAdapter({...})` call, add the `longPolling` option:

```typescript
const telegramAdapter = createTelegramAdapter({
  botToken: token,
  mode: 'polling',
  // retryDelayMs > timeout so a network drop can't cascade into a
  // permanent Conflict loop (SDK max backoff = server timeout = race).
  longPolling: { timeout: 10, retryDelayMs: 11000 },
});
```

### Dashboard infrastructure: AdminAPI + DashboardPusher + event bus

**Intent:** Optional real-time monitoring and management backend for the `@evenisse/nanoclaw-dashboard` admin UI. Activated only when `DASHBOARD_SECRET` is set in `.env`. Adds three new source files and wires them into three existing host files.

**Files (new — copy verbatim from backup tag):**
- `src/admin-api.ts` (~914 lines) — REST API on localhost:3101, auth by Bearer token
- `src/dashboard-pusher.ts` (~619 lines) — Posts JSON snapshots to the dashboard every 60 s, streams log-tail and real-time events
- `src/dashboard/event-bus.ts` (14 lines) — Shared EventEmitter + event type definitions

**Files (modified):** `src/index.ts`, `src/session-manager.ts`, `src/host-sweep.ts`

**How to apply:**

1. Copy the three new files from the backup tag:
   ```bash
   git checkout <backup-tag> -- src/admin-api.ts src/dashboard-pusher.ts src/dashboard/event-bus.ts
   ```

2. In `src/index.ts`, after the `startCliServer()` call (step 7) and before the final `log.info('NanoClaw running')`, insert:
   ```typescript
   // 8. Dashboard (optional — requires DASHBOARD_SECRET in .env)
   {
     const { readEnvFile } = await import('./env.js');
     const dashEnv = readEnvFile(['DASHBOARD_SECRET', 'DASHBOARD_PORT', 'ADMIN_PORT']);
     const dashboardSecret = process.env.DASHBOARD_SECRET || dashEnv.DASHBOARD_SECRET;
     const dashboardPort = parseInt(process.env.DASHBOARD_PORT || dashEnv.DASHBOARD_PORT || '3100', 10);
     const adminPort = parseInt(process.env.ADMIN_PORT || dashEnv.ADMIN_PORT || '3101', 10);
     if (dashboardSecret) {
       const { startDashboardPusher, stopDashboardPusher } = await import('./dashboard-pusher.js');
       const { startAdminApi, stopAdminApi } = await import('./admin-api.js');
       startAdminApi({ port: adminPort, secret: dashboardSecret });
       startDashboardPusher({ port: dashboardPort, secret: dashboardSecret, intervalMs: 60000 });
       onShutdown(stopAdminApi);
       onShutdown(async () => stopDashboardPusher());
     } else {
       log.info('Dashboard disabled (set DASHBOARD_SECRET in .env to enable)');
     }
   }
   ```

3. In `src/session-manager.ts`, add the import at the top (with the other imports):
   ```typescript
   import { emitDashboardEvent } from './dashboard/event-bus.js';
   ```
   Then at the end of `markContainerRunning()`, `markContainerIdle()`, and `markContainerStopped()`, emit a session-status event after each `updateSession(...)` call:
   ```typescript
   // markContainerRunning — after updateSession:
   const s = getSession(sessionId);
   if (s)
     emitDashboardEvent({
       type: 'session-status',
       sessionId,
       agentGroupId: s.agent_group_id,
       containerStatus: 'running',
     });

   // markContainerIdle — after updateSession:
   const s = getSession(sessionId);
   if (s)
     emitDashboardEvent({ type: 'session-status', sessionId, agentGroupId: s.agent_group_id, containerStatus: 'idle' });

   // markContainerStopped — after updateSession:
   const s = getSession(sessionId);
   if (s)
     emitDashboardEvent({
       type: 'session-status',
       sessionId,
       agentGroupId: s.agent_group_id,
       containerStatus: 'stopped',
     });
   ```

4. In `src/host-sweep.ts`, add the import:
   ```typescript
   import { emitDashboardEvent } from './dashboard/event-bus.js';
   ```
   At the end of the `sweep()` function's try-block (after `sweepSession` loops), add:
   ```typescript
   emitDashboardEvent({ type: 'sweep-tick', timestamp: new Date().toISOString() });
   ```
   In `sweepSession()`, inside the `if (alive && outDb)` block (after `enforceRunningContainerSla`), add:
   ```typescript
   const cs = getContainerState(outDb);
   if (cs?.current_tool) {
     emitDashboardEvent({
       type: 'tool-active',
       sessionId: session.id,
       agentGroupId: agentGroup.id,
       tool: cs.current_tool,
       startedAt: cs.tool_started_at ?? '',
     });
   } else {
     emitDashboardEvent({ type: 'tool-done', sessionId: session.id, agentGroupId: agentGroup.id });
   }
   ```

**Env vars required** (add to `.env` to activate):
```
DASHBOARD_SECRET=<any-strong-secret>
DASHBOARD_PORT=3100     # where the dashboard UI listens (optional, default 3100)
ADMIN_PORT=3101         # where the admin REST API listens (optional, default 3101)
```
