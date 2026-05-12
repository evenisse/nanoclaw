# NanoClaw Migration Guide

Generated: 2026-05-12T16:13:17Z
Base: 9e8f256dd2f857d4cf2825f624453e048642408d
HEAD at generation: 382b3c6a1c9a4a98f558b4f3556b7975059e57fb
Upstream at migration: 61d7ca6bbafc0137f305cce368447f7603ab7549
Last upgraded to: 61d7ca6bbafc0137f305cce368447f7603ab7549 (v2.0.58)

## Applied Skills

- `add-telegram` — from `origin/channels` branch (files: `src/channels/telegram.ts`, `telegram-markdown-sanitize.ts`, `telegram-pairing.ts` + tests)

Custom skills: none.

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
