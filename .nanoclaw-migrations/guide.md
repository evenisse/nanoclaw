# NanoClaw Migration Guide

Generated: 2026-04-04T18:04:17Z
Updated: 2026-04-05T00:08:00Z
Base: 391b729623d9de6838960561f4b54eaa02746a42
HEAD at generation: 70ae9a02b6bd3e5c1eb6d1fca62eeb56bc778ff7
Upstream: 391b729623d9de6838960561f4b54eaa02746a42

## Applied Skills

These are reapplied by merging the upstream skill branch:

- `apple-container` — branch `skill/apple-container`
- `channel-formatting` — branch `skill/channel-formatting`
- `compact` — branch `skill/compact`
- `emacs` — branch `skill/emacs`
- `migrate-nanoclaw` — branch `skill/migrate-nanoclaw`
- `native-credential-proxy` — branch `skill/native-credential-proxy`
- `ollama-tool` — branch `skill/ollama-tool`

## Applied Channel Repos

These channels come from separate upstream repos (not skill branches). Reapply by merging from their remote:

- **WhatsApp** — remote `whatsapp` (https://github.com/qwibitai/nanoclaw-whatsapp.git), merge `whatsapp/main`
- **Discord** — remote `discord` (https://github.com/qwibitai/nanoclaw-discord.git), merge `discord/main`

Add remotes if missing:
```bash
git remote add whatsapp https://github.com/qwibitai/nanoclaw-whatsapp.git
git remote add discord https://github.com/qwibitai/nanoclaw-discord.git
git fetch whatsapp && git fetch discord
git merge whatsapp/main --no-edit
git merge discord/main --no-edit
```

## Skill Interactions

- `apple-container` skill and the Linux/Docker adaptation (see Customizations below) modify the same files: `src/container-runtime.ts` and `container/build.sh`. Merge `skill/apple-container` first, then apply the Linux/Docker customization on top.
- `native-credential-proxy` + `ollama-tool` both modify `src/container-runner.ts`. After merging both, verify that `OLLAMA_ADMIN_TOOLS` flag and OneCLI `applyContainerConfig` call are both present.

## Customizations

### Linux/Docker adaptation — container-runtime.ts

**Intent:** This fork runs on bare-metal Linux with Docker (not macOS with Apple Container). Several adaptations make container-runtime.ts work correctly in this environment.

**Files:** `src/container-runtime.ts`, `container/build.sh`

**How to apply:**

Apply after merging `skill/apple-container` (which introduces the credential proxy and container runtime structure).

#### 1. Hardcode Docker runtime and add host gateway constant

In `src/container-runtime.ts`, verify these constants at the top of the file:

```typescript
/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';

/** Hostname containers use to reach the host machine. */
export const CONTAINER_HOST_GATEWAY = 'host.docker.internal';
```

#### 2. Add Linux-aware credential proxy bind host detection

After the `CONTAINER_HOST_GATEWAY` constant, add:

```typescript
/**
 * Address the credential proxy binds to.
 * Docker Desktop (macOS): 127.0.0.1 — the VM routes host.docker.internal to loopback.
 * Docker (Linux): bind to the docker0 bridge IP so only containers can reach it,
 *   falling back to 0.0.0.0 if the interface isn't found.
 */
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') return '127.0.0.1';

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
  // Check /proc filesystem, not env vars — WSL_DISTRO_NAME isn't set under systemd.
  if (fs.existsSync('/proc/sys/fs/binfmt_misc/WSLInterop')) return '127.0.0.1';

  // Bare-metal Linux: bind to the docker0 bridge IP instead of 0.0.0.0
  const ifaces = os.networkInterfaces();
  const docker0 = ifaces['docker0'];
  if (docker0) {
    const ipv4 = docker0.find((a) => a.family === 'IPv4');
    if (ipv4) return ipv4.address;
  }
  return '0.0.0.0';
}
```

Add `import fs from 'fs';` at the top of the file (alongside the existing `import os from 'os';`).

#### 3. Auto-start Docker via systemd on Linux

In `ensureContainerRuntimeRunning()`, replace the simple error throw with a systemd-based auto-start:

```typescript
export function ensureContainerRuntimeRunning(): void {
  try {
    execSync(`${CONTAINER_RUNTIME_BIN} info`, { stdio: 'pipe' });
    logger.debug('Container runtime already running');
  } catch {
    logger.info('Starting container runtime...');
    try {
      execSync('sudo systemctl start docker', {
        stdio: 'pipe',
        timeout: 30000,
      });
      logger.info('Container runtime started');
    } catch (err) {
      logger.error({ err }, 'Failed to start container runtime');
      // ... existing error banner ...
      throw new Error('Container runtime is required but failed to start');
    }
  }
}
```

#### 4. Fix container build script default runtime

In `container/build.sh`, change the default runtime from `container` (Apple Container) back to `docker`:

```bash
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
```

The `skill/apple-container` merge changes this to `container`. Revert it after merging that skill.

#### 5. Remove stop timeout flag

In `stopContainer()`, Docker on Linux doesn't need the `-t 1` flag that Apple Container requires:

```typescript
execSync(`${CONTAINER_RUNTIME_BIN} stop ${name}`, { stdio: 'pipe' });
```

### Restore accidentally deleted GitHub workflows

**Intent:** Two GitHub Actions workflows were accidentally deleted during a merge. They should be restored.

**Files:** `.github/workflows/bump-version.yml`, `.github/workflows/update-tokens.yml`

**How to apply:**

These files exist in upstream. After upgrading to upstream HEAD, verify they are present:

```bash
ls .github/workflows/
```

If missing, restore from upstream:

```bash
git checkout upstream/main -- .github/workflows/bump-version.yml
git checkout upstream/main -- .github/workflows/update-tokens.yml
```
