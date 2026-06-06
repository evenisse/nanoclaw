/**
 * NanoClaw admin REST API — management endpoints for the dashboard.
 *
 * Binds to 127.0.0.1 only. Auth: Authorization: Bearer <secret>.
 * Intended to be proxied by @evenisse/nanoclaw-dashboard on port 3100.
 */
import { randomUUID } from 'crypto';
import http from 'http';

import { getAllAgentGroups, getAgentGroup, createAgentGroup, updateAgentGroup } from './db/agent-groups.js';
import {
  getAllMessagingGroups,
  createMessagingGroup,
  updateMessagingGroup,
  deleteMessagingGroup,
  createMessagingGroupAgent,
  updateMessagingGroupAgent,
  deleteMessagingGroupAgent,
  getMessagingGroupAgents,
} from './db/messaging-groups.js';
import { getActiveSessions, getSessionsByAgentGroup } from './db/sessions.js';
import {
  getContainerConfig,
  getAllContainerConfigs,
  createContainerConfig,
  updateContainerConfigScalars,
  updateContainerConfigJson,
} from './db/container-configs.js';
import { getDb, hasTable } from './db/connection.js';
import { getContainerState, openOutboundDb } from './db/session-db.js';
import {
  createDestination,
  getDestinations,
  deleteDestination,
} from './modules/agent-to-agent/db/agent-destinations.js';
import { addMember, removeMember, getMembers } from './modules/permissions/db/agent-group-members.js';
import { getAllUsers } from './modules/permissions/db/users.js';
import { getUserRoles, grantRole, revokeRole, getAdminsOfAgentGroup } from './modules/permissions/db/user-roles.js';
import { getActiveAdapters } from './channels/channel-registry.js';
import { initGroupFilesystem } from './group-init.js';
import { outboundDbPath } from './session-manager.js';
import { log } from './log.js';
import { DATA_DIR } from './config.js';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

interface AdminConfig {
  port: number;
  secret: string;
}

let server: http.Server | null = null;

export function startAdminApi(config: AdminConfig): void {
  server = http.createServer((req, res) => {
    handle(req, res, config).catch((err) => {
      log.error('Admin API error', { url: req.url, err });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });

  server.listen(config.port, '127.0.0.1', () => {
    log.info('Admin API started', { port: config.port });
  });
}

export function stopAdminApi(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
      server = null;
    } else {
      resolve();
    }
  });
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse, config: AdminConfig): Promise<void> {
  // Auth
  const auth = req.headers.authorization;
  if (auth !== `Bearer ${config.secret}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://localhost:${config.port}`);
  const segments = url.pathname.replace(/^\//, '').split('/');

  res.setHeader('Content-Type', 'application/json');

  // Route
  try {
    const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : null;

    if (segments[0] === 'agents') {
      await handleAgents(method, segments, body, res);
    } else if (segments[0] === 'channels') {
      await handleChannels(method, segments, body, res);
    } else if (segments[0] === 'wirings') {
      await handleWirings(method, segments, body, res);
    } else if (segments[0] === 'destinations') {
      await handleDestinations(method, segments, body, res);
    } else if (segments[0] === 'members') {
      await handleMembers(method, segments, body, res);
    } else if (segments[0] === 'roles') {
      await handleRoles(method, segments, body, res);
    } else if (segments[0] === 'sessions') {
      await handleSessions(method, segments, res);
    } else if (segments[0] === 'tokens') {
      json(res, collectTokens());
    } else if (segments[0] === 'users') {
      json(res, collectUsers());
    } else if (segments[0] === 'graph') {
      json(res, collectGraph());
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
}

// ── Agents ─────────────────────────────────────────────────────────────────

async function handleAgents(method: string, segs: string[], body: unknown, res: http.ServerResponse): Promise<void> {
  const id = segs[1];

  if (method === 'GET' && !id) {
    const groups = getAllAgentGroups();
    const configs = getAllContainerConfigs();
    const configMap = new Map(configs.map((c) => [c.agent_group_id, c]));
    json(
      res,
      groups.map((g) => ({ ...g, container_config: configMap.get(g.id) ?? null })),
    );
    return;
  }

  if (method === 'GET' && id) {
    const group = getAgentGroup(id);
    if (!group) {
      notFound(res);
      return;
    }
    const config = getContainerConfig(id);
    json(res, { ...group, container_config: config ?? null });
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.name || typeof b.name !== 'string') throw new Error('name is required');
    if (!b.folder || typeof b.folder !== 'string') throw new Error('folder is required');

    const agentId = `ag-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const group = {
      id: agentId,
      name: b.name as string,
      folder: b.folder as string,
      agent_provider: null,
      created_at: now,
    };

    createAgentGroup(group);
    initGroupFilesystem(group, b.instructions ? { instructions: b.instructions as string } : undefined);

    createContainerConfig({
      agent_group_id: agentId,
      provider: (b.provider as string) ?? null,
      model: (b.model as string) ?? null,
      effort: (b.effort as string) ?? null,
      image_tag: null,
      assistant_name: (b.assistant_name as string) ?? null,
      max_messages_per_prompt: typeof b.max_messages_per_prompt === 'number' ? b.max_messages_per_prompt : null,
      skills: JSON.stringify('all'),
      mcp_servers: JSON.stringify({}),
      packages_apt: JSON.stringify([]),
      packages_npm: JSON.stringify([]),
      additional_mounts: JSON.stringify([]),
      cli_scope: (b.cli_scope as string) ?? 'group',
      updated_at: now,
    });

    res.writeHead(201);
    json(res, { ...group, container_config: getContainerConfig(agentId) });
    return;
  }

  if (!id) {
    notFound(res);
    return;
  }

  if (method === 'PATCH') {
    const group = getAgentGroup(id);
    if (!group) {
      notFound(res);
      return;
    }
    const b = body as Record<string, unknown>;

    if (b.name !== undefined) updateAgentGroup(id, { name: b.name as string });

    const scalars: Parameters<typeof updateContainerConfigScalars>[1] = {};
    for (const k of [
      'provider',
      'model',
      'effort',
      'image_tag',
      'assistant_name',
      'max_messages_per_prompt',
      'cli_scope',
    ] as const) {
      if (b[k] !== undefined) (scalars as Record<string, unknown>)[k] = b[k];
    }
    if (Object.keys(scalars).length > 0) updateContainerConfigScalars(id, scalars);

    for (const col of ['mcp_servers', 'packages_apt', 'packages_npm', 'additional_mounts', 'skills'] as const) {
      if (b[col] !== undefined) updateContainerConfigJson(id, col, b[col]);
    }

    json(res, { ...getAgentGroup(id), container_config: getContainerConfig(id) });
    return;
  }

  if (method === 'DELETE') {
    if (!getAgentGroup(id)) {
      notFound(res);
      return;
    }
    const db = getDb();
    const hasAgentDestinations = hasTable(db, 'agent_destinations');
    const hasPendingApprovals = hasTable(db, 'pending_approvals');
    db.transaction((groupId: string) => {
      if (hasAgentDestinations) {
        db.prepare('DELETE FROM agent_destinations WHERE agent_group_id = ?').run(groupId);
        db.prepare('DELETE FROM agent_destinations WHERE target_type = ? AND target_id = ?').run('agent', groupId);
      }
      db.prepare(
        'DELETE FROM pending_questions WHERE session_id IN (SELECT id FROM sessions WHERE agent_group_id = ?)',
      ).run(groupId);
      if (hasPendingApprovals) {
        db.prepare(
          'DELETE FROM pending_approvals WHERE agent_group_id = ? OR session_id IN (SELECT id FROM sessions WHERE agent_group_id = ?)',
        ).run(groupId, groupId);
      }
      db.prepare('DELETE FROM sessions WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM pending_sender_approvals WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM pending_channel_approvals WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM messaging_group_agents WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM agent_group_members WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM user_roles WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM container_configs WHERE agent_group_id = ?').run(groupId);
      db.prepare('DELETE FROM agent_groups WHERE id = ?').run(groupId);
    })(id);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Channels ───────────────────────────────────────────────────────────────

async function handleChannels(method: string, segs: string[], body: unknown, res: http.ServerResponse): Promise<void> {
  const id = segs[1];

  if (method === 'GET' && !id) {
    const groups = getAllMessagingGroups();
    const liveAdapters = new Set(getActiveAdapters().map((a) => a.channelType));
    json(
      res,
      groups.map((g) => ({
        ...g,
        is_live: liveAdapters.has(g.channel_type),
        wirings: getMessagingGroupAgents(g.id),
      })),
    );
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.channel_type || !b.platform_id) throw new Error('channel_type and platform_id are required');
    const mg = {
      id: randomUUID(),
      channel_type: b.channel_type as string,
      platform_id: b.platform_id as string,
      name: (b.name as string) ?? null,
      is_group: b.is_group ? 1 : 0,
      unknown_sender_policy: (b.unknown_sender_policy as 'strict' | 'request_approval' | 'public') ?? 'strict',
      created_at: new Date().toISOString(),
    };
    createMessagingGroup(mg);
    res.writeHead(201);
    json(res, mg);
    return;
  }

  if (!id) {
    notFound(res);
    return;
  }

  if (method === 'PATCH') {
    const b = body as Record<string, unknown>;
    updateMessagingGroup(id, {
      name: b.name as string | undefined,
      unknown_sender_policy: b.unknown_sender_policy as 'strict' | 'request_approval' | 'public' | undefined,
    });
    json(res, { id });
    return;
  }

  if (method === 'DELETE') {
    deleteMessagingGroup(id);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Wirings ────────────────────────────────────────────────────────────────

async function handleWirings(method: string, segs: string[], body: unknown, res: http.ServerResponse): Promise<void> {
  const id = segs[1];

  if (method === 'GET') {
    const rows = getDb()
      .prepare(
        `SELECT mga.*, mg.channel_type, mg.platform_id, mg.name as mg_name,
                ag.name as ag_name
         FROM messaging_group_agents mga
         JOIN messaging_groups mg ON mg.id = mga.messaging_group_id
         JOIN agent_groups ag ON ag.id = mga.agent_group_id`,
      )
      .all();
    json(res, rows);
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.messaging_group_id || !b.agent_group_id)
      throw new Error('messaging_group_id and agent_group_id are required');
    const mga = {
      id: randomUUID(),
      messaging_group_id: b.messaging_group_id as string,
      agent_group_id: b.agent_group_id as string,
      engage_mode: ((b.engage_mode as string) ?? 'pattern') as import('./types.js').EngageMode,
      engage_pattern: (b.engage_pattern as string) ?? '.',
      sender_scope: ((b.sender_scope as string) ?? 'all') as import('./types.js').SenderScope,
      ignored_message_policy: ((b.ignored_message_policy as string) ??
        'accumulate') as import('./types.js').IgnoredMessagePolicy,
      session_mode: ((b.session_mode as string) ?? 'shared') as 'shared' | 'per-thread' | 'agent-shared',
      priority: typeof b.priority === 'number' ? b.priority : 0,
      created_at: new Date().toISOString(),
    };
    createMessagingGroupAgent(mga);
    res.writeHead(201);
    json(res, mga);
    return;
  }

  if (!id) {
    notFound(res);
    return;
  }

  if (method === 'PATCH') {
    const b = body as Record<string, unknown>;
    const updates: Parameters<typeof updateMessagingGroupAgent>[1] = {};
    for (const k of [
      'engage_mode',
      'engage_pattern',
      'sender_scope',
      'ignored_message_policy',
      'session_mode',
      'priority',
    ] as const) {
      if (b[k] !== undefined) (updates as Record<string, unknown>)[k] = b[k];
    }
    updateMessagingGroupAgent(id, updates);
    json(res, { id });
    return;
  }

  if (method === 'DELETE') {
    deleteMessagingGroupAgent(id);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Destinations ───────────────────────────────────────────────────────────

async function handleDestinations(
  method: string,
  segs: string[],
  body: unknown,
  res: http.ServerResponse,
): Promise<void> {
  if (method === 'GET') {
    const rows = getDb()
      .prepare(
        `SELECT ad.*, ag_src.name as source_name, ag_tgt.name as target_name
         FROM agent_destinations ad
         JOIN agent_groups ag_src ON ag_src.id = ad.agent_group_id
         LEFT JOIN agent_groups ag_tgt ON ag_tgt.id = ad.target_id AND ad.target_type = 'agent'`,
      )
      .all();
    json(res, rows);
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.agent_group_id || !b.local_name || !b.target_type || !b.target_id) {
      throw new Error('agent_group_id, local_name, target_type, and target_id are required');
    }
    const dest = {
      agent_group_id: b.agent_group_id as string,
      local_name: b.local_name as string,
      target_type: b.target_type as 'channel' | 'agent',
      target_id: b.target_id as string,
      created_at: new Date().toISOString(),
    };
    createDestination(dest);

    // Propagate to all active sessions of this agent group (destination projection invariant)
    propagateDestinations(dest.agent_group_id);

    res.writeHead(201);
    json(res, dest);
    return;
  }

  if (method === 'DELETE' && segs[1] && segs[2]) {
    const agentGroupId = segs[1];
    const localName = segs[2];
    deleteDestination(agentGroupId, localName);
    propagateDestinations(agentGroupId);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

function propagateDestinations(agentGroupId: string): void {
  const sessions = getSessionsByAgentGroup(agentGroupId);
  for (const s of sessions) {
    if (s.container_status === 'running' || s.container_status === 'idle') {
      import('./modules/agent-to-agent/write-destinations.js')
        .then(({ writeDestinations }) => writeDestinations(agentGroupId, s.id))
        .catch((err) => log.warn('Failed to propagate destinations to session', { sessionId: s.id, err }));
    }
  }
}

// ── Members ────────────────────────────────────────────────────────────────

async function handleMembers(method: string, segs: string[], body: unknown, res: http.ServerResponse): Promise<void> {
  const agentGroupId = segs[1];

  if (method === 'GET' && agentGroupId) {
    json(res, getMembers(agentGroupId));
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.user_id || !b.agent_group_id) throw new Error('user_id and agent_group_id are required');
    addMember({
      user_id: b.user_id as string,
      agent_group_id: b.agent_group_id as string,
      added_by: (b.added_by as string) ?? 'dashboard',
      added_at: new Date().toISOString(),
    });
    res.writeHead(201);
    json(res, { user_id: b.user_id, agent_group_id: b.agent_group_id });
    return;
  }

  if (method === 'DELETE' && segs[1] && segs[2]) {
    removeMember(segs[2], segs[1]);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Roles ──────────────────────────────────────────────────────────────────

async function handleRoles(method: string, segs: string[], body: unknown, res: http.ServerResponse): Promise<void> {
  if (method === 'GET') {
    const users = getAllUsers();
    json(
      res,
      users.map((u) => ({ ...u, roles: getUserRoles(u.id) })),
    );
    return;
  }

  if (method === 'POST') {
    const b = body as Record<string, unknown>;
    if (!b.user_id || !b.role) throw new Error('user_id and role are required');
    grantRole({
      user_id: b.user_id as string,
      role: b.role as 'owner' | 'admin',
      agent_group_id: (b.agent_group_id as string) ?? null,
      granted_by: (b.granted_by as string) ?? 'dashboard',
      granted_at: new Date().toISOString(),
    });
    res.writeHead(201);
    json(res, { user_id: b.user_id, role: b.role });
    return;
  }

  if (method === 'DELETE' && segs[1]) {
    const b = (body as Record<string, unknown>) ?? {};
    const userId = segs[1];
    const role = (segs[2] ?? b.role) as 'owner' | 'admin';
    const agentGroupId = (segs[3] ?? b.agent_group_id ?? null) as string | null;
    revokeRole(userId, role, agentGroupId);
    res.writeHead(204);
    res.end();
    return;
  }

  res.writeHead(405);
  res.end(JSON.stringify({ error: 'Method not allowed' }));
}

// ── Sessions ───────────────────────────────────────────────────────────────

async function handleSessions(method: string, segs: string[], res: http.ServerResponse): Promise<void> {
  if (method !== 'GET') {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  const sessionId = segs[1];
  const sub = segs[2];

  if (!sessionId) {
    const sessions = getDb()
      .prepare(
        `SELECT s.*, ag.name as agent_group_name, mg.channel_type, mg.platform_id, mg.name as mg_name
         FROM sessions s
         LEFT JOIN agent_groups ag ON ag.id = s.agent_group_id
         LEFT JOIN messaging_groups mg ON mg.id = s.messaging_group_id
         ORDER BY s.last_active DESC`,
      )
      .all();
    json(res, sessions);
    return;
  }

  const session = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | Record<string, unknown>
    | undefined;

  if (!session) {
    notFound(res);
    return;
  }

  if (sub === 'messages') {
    const agentGroupId = session.agent_group_id as string;
    const sessDir = path.join(DATA_DIR, 'v2-sessions', agentGroupId, sessionId);
    const inbound: unknown[] = [];
    const outbound: unknown[] = [];

    const inPath = path.join(sessDir, 'inbound.db');
    if (fs.existsSync(inPath)) {
      try {
        const db = new Database(inPath, { readonly: true });
        inbound.push(
          ...(db.prepare('SELECT * FROM messages_in ORDER BY seq DESC LIMIT 50').all() as unknown[]).reverse(),
        );
        db.close();
      } catch {
        /* ignore */
      }
    }

    const outPath = path.join(sessDir, 'outbound.db');
    if (fs.existsSync(outPath)) {
      try {
        const db = new Database(outPath, { readonly: true });
        outbound.push(
          ...(db.prepare('SELECT * FROM messages_out ORDER BY seq DESC LIMIT 50').all() as unknown[]).reverse(),
        );
        db.close();
      } catch {
        /* ignore */
      }
    }

    json(res, { sessionId, inbound, outbound });
    return;
  }

  if (sub === 'tool') {
    const agentGroupId = session.agent_group_id as string;
    const outPath = outboundDbPath(agentGroupId, sessionId);
    if (!fs.existsSync(outPath)) {
      json(res, null);
      return;
    }
    try {
      const db = new Database(outPath, { readonly: true });
      const state = getContainerState(db);
      db.close();
      json(res, state);
    } catch {
      json(res, null);
    }
    return;
  }

  json(res, session);
}

// ── Tokens ─────────────────────────────────────────────────────────────────

const PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheCreate: number }> = {
  'claude-opus-4-8': { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-opus-4-7': { input: 15, output: 75, cacheRead: 1.5, cacheCreate: 18.75 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-sonnet-4-5': { input: 3, output: 15, cacheRead: 0.3, cacheCreate: 3.75 },
  'claude-haiku-4-5': { input: 0.8, output: 4, cacheRead: 0.08, cacheCreate: 1 },
};

let tokenCache: { data: unknown; at: number } | null = null;

function collectTokens(): unknown {
  const now = Date.now();
  if (tokenCache && now - tokenCache.at < 60000) return tokenCache.data;

  const sessionsDir = path.join(DATA_DIR, 'v2-sessions');
  const agentGroups = getAllAgentGroups();
  const nameMap = new Map(agentGroups.map((g) => [g.id, g.name]));
  const allEntries: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    agentGroupId: string;
  }> = [];

  if (fs.existsSync(sessionsDir)) {
    for (const agDir of fs.readdirSync(sessionsDir).filter((d) => d.startsWith('ag-'))) {
      const entries = scanJsonlTokens(path.join(sessionsDir, agDir));
      allEntries.push(...entries.map((e) => ({ ...e, agentGroupId: agDir })));
    }
  }

  const byModel: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      costUsd: number;
    }
  > = {};
  const byGroup: Record<
    string,
    {
      requests: number;
      inputTokens: number;
      outputTokens: number;
      cacheReadTokens: number;
      cacheCreationTokens: number;
      name: string;
      costUsd: number;
    }
  > = {};
  const totals = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costUsd: 0,
  };

  for (const e of allEntries) {
    const pricing = PRICING[e.model] ?? PRICING['claude-sonnet-4-6'];
    const cost =
      (e.inputTokens * pricing.input +
        e.outputTokens * pricing.output +
        e.cacheReadTokens * pricing.cacheRead +
        e.cacheCreationTokens * pricing.cacheCreate) /
      1_000_000;

    if (!byModel[e.model])
      byModel[e.model] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
      };
    byModel[e.model].requests++;
    byModel[e.model].inputTokens += e.inputTokens;
    byModel[e.model].outputTokens += e.outputTokens;
    byModel[e.model].cacheReadTokens += e.cacheReadTokens;
    byModel[e.model].cacheCreationTokens += e.cacheCreationTokens;
    byModel[e.model].costUsd += cost;

    if (!byGroup[e.agentGroupId])
      byGroup[e.agentGroupId] = {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        name: nameMap.get(e.agentGroupId) || e.agentGroupId,
        costUsd: 0,
      };
    byGroup[e.agentGroupId].requests++;
    byGroup[e.agentGroupId].inputTokens += e.inputTokens;
    byGroup[e.agentGroupId].outputTokens += e.outputTokens;
    byGroup[e.agentGroupId].cacheReadTokens += e.cacheReadTokens;
    byGroup[e.agentGroupId].cacheCreationTokens += e.cacheCreationTokens;
    byGroup[e.agentGroupId].costUsd += cost;

    totals.requests++;
    totals.inputTokens += e.inputTokens;
    totals.outputTokens += e.outputTokens;
    totals.cacheReadTokens += e.cacheReadTokens;
    totals.cacheCreationTokens += e.cacheCreationTokens;
    totals.costUsd += cost;
  }

  const data = {
    totals,
    byModel,
    byGroup,
    pricingNote: 'Estimated using static pricing table. Actual costs may vary.',
  };
  tokenCache = { data, at: now };
  return data;
}

function scanJsonlTokens(agentDir: string) {
  const claudeDir = path.join(agentDir, '.claude-shared', 'projects');
  if (!fs.existsSync(claudeDir)) return [];

  const entries: Array<{
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }> = [];

  const walk = (dir: string): void => {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.jsonl') || entry.name.includes('.jsonl.rotated-')) {
          try {
            for (const line of fs.readFileSync(full, 'utf-8').split('\n')) {
              if (!line.trim()) continue;
              try {
                const r = JSON.parse(line);
                if (r.type === 'assistant' && r.message?.usage) {
                  const u = r.message.usage;
                  entries.push({
                    model: r.message.model || 'unknown',
                    inputTokens: u.input_tokens || 0,
                    outputTokens: u.output_tokens || 0,
                    cacheReadTokens: u.cache_read_input_tokens || 0,
                    cacheCreationTokens: u.cache_creation_input_tokens || 0,
                  });
                }
              } catch {
                /* skip */
              }
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip */
    }
  };
  walk(claudeDir);
  return entries;
}

// ── Users & Graph ──────────────────────────────────────────────────────────

function collectUsers(): unknown {
  return getAllUsers().map((u) => ({
    ...u,
    roles: getUserRoles(u.id),
    memberships: getDb()
      .prepare(
        `SELECT agm.agent_group_id, ag.name as agent_group_name FROM agent_group_members agm JOIN agent_groups ag ON ag.id = agm.agent_group_id WHERE agm.user_id = ?`,
      )
      .all(u.id),
  }));
}

function collectGraph(): unknown {
  const groups = getAllAgentGroups();
  const sessions = getActiveSessions();
  const channelGroups = getAllMessagingGroups();
  const liveAdapters = new Set(getActiveAdapters().map((a) => a.channelType));

  const sessionByAgent = new Map<string, typeof sessions>();
  for (const s of sessions) {
    if (!sessionByAgent.has(s.agent_group_id)) sessionByAgent.set(s.agent_group_id, []);
    sessionByAgent.get(s.agent_group_id)!.push(s);
  }

  const nodes: unknown[] = [
    ...groups.map((g) => {
      const agSessions = sessionByAgent.get(g.id) ?? [];
      const running = agSessions.filter(
        (s) => s.container_status === 'running' || s.container_status === 'idle',
      ).length;
      const config = getContainerConfig(g.id);
      return {
        id: g.id,
        type: 'agent',
        data: {
          name: g.name,
          folder: g.folder,
          model: config?.model ?? null,
          provider: config?.provider ?? null,
          sessionCount: agSessions.length,
          runningSessions: running,
        },
      };
    }),
    ...channelGroups.map((mg) => ({
      id: mg.id,
      type: 'channel',
      data: {
        channelType: mg.channel_type,
        platformId: mg.platform_id,
        name: mg.name,
        isGroup: mg.is_group === 1,
        isLive: liveAdapters.has(mg.channel_type),
      },
    })),
  ];

  const wirings = getDb().prepare(`SELECT * FROM messaging_group_agents`).all() as Array<Record<string, unknown>>;

  const destinations = getDb().prepare(`SELECT * FROM agent_destinations WHERE target_type = 'agent'`).all() as Array<
    Record<string, unknown>
  >;

  const edges: unknown[] = [
    ...wirings.map((w) => ({
      id: `wiring-${w.id}`,
      source: w.agent_group_id as string,
      target: w.messaging_group_id as string,
      type: 'wiring',
      data: { engageMode: w.engage_mode, sessionMode: w.session_mode, priority: w.priority },
      animated: false,
    })),
    ...destinations.map((d) => ({
      id: `a2a-${d.agent_group_id}-${d.local_name}`,
      source: d.agent_group_id as string,
      target: d.target_id as string,
      type: 'a2a',
      data: { localName: d.local_name },
      animated: true,
    })),
  ];

  return { nodes, edges };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function json(res: http.ServerResponse, data: unknown): void {
  if (!res.headersSent) res.writeHead(200);
  res.end(JSON.stringify(data));
}

function notFound(res: http.ServerResponse): void {
  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return {};
  return JSON.parse(raw);
}
