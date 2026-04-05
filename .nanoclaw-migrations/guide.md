# NanoClaw Migration Guide

Generated: 2026-04-04T18:04:17Z
Updated: 2026-04-05T23:20:00Z
Base: 6c289c3a807fb55936a1e7df7a42bc89a53d57b6
HEAD at generation: 17ab932e9cf96e95ec497c3ef6cc48b992719bcb
Upstream: 6c289c3a807fb55936a1e7df7a42bc89a53d57b6

## Applied Skills

These are reapplied by merging the upstream skill branch:

- `apple-container` — branch `skill/apple-container`
- `channel-formatting` — branch `skill/channel-formatting`
- `compact` — branch `skill/compact`
- `emacs` — branch `skill/emacs`
- `migrate-from-openclaw` — branch `skill/migrate-from-openclaw`
- `migrate-nanoclaw` — branch `skill/migrate-nanoclaw`
- `native-credential-proxy` — branch `skill/native-credential-proxy`
- `ollama-tool` — branch `skill/ollama-tool`
- `wiki` — branch `skill/wiki`

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
- `native-credential-proxy` removes `ONECLI_URL` from config.ts, but this fork uses OneCLI. After merging `native-credential-proxy`, keep `ONECLI_URL` in the config.

## Merge Conflict Resolutions

### skill/apple-container — src/config.ts

When merging `skill/apple-container`, take the skill's version for `CREDENTIAL_PROXY_PORT` and keep `ONECLI_URL` with fallback:

```typescript
export const CREDENTIAL_PROXY_PORT = parseInt(
  process.env.CREDENTIAL_PROXY_PORT || '3001',
  10,
);
export const ONECLI_URL =
  process.env.ONECLI_URL || envConfig.ONECLI_URL || 'http://localhost:10254';
```

### skill/native-credential-proxy — src/config.ts

The skill removes `ONECLI_URL`. Keep it (this fork uses OneCLI):

```typescript
export const ONECLI_URL =
  process.env.ONECLI_URL || envConfig.ONECLI_URL || 'http://localhost:10254';
```

### skill/native-credential-proxy — src/container-runner.ts

The skill removes the `/dev/null` .env shadowing that the apple-container merge removed. Restore it (Docker supports file mounts):

```typescript
const envFile = path.join(projectRoot, '.env');
if (fs.existsSync(envFile)) {
  mounts.push({
    hostPath: '/dev/null',
    containerPath: '/workspace/project/.env',
    readonly: true,
  });
}
```

Also keep the store mount from apple-container:
```typescript
const storeDir = path.join(projectRoot, 'store');
mounts.push({
  hostPath: storeDir,
  containerPath: '/workspace/project/store',
  readonly: false,
});
```

The `buildContainerArgs` function should NOT have `isMain` parameter (use `--user` always on Docker). The call site passes `agentIdentifier` instead.

### skill/ollama-tool — src/container-runner.ts

Merge ollama-tool's OneCLI + OLLAMA_ADMIN_TOOLS approach. Remove `detectAuthMode` import (no longer used). The `else` block after `applyContainerConfig` should warn, not inject a placeholder token:

```typescript
} else {
  logger.warn(
    { containerName },
    'OneCLI gateway not reachable — container will have no credentials',
  );
}
```

Also ensure `buildContainerArgs` is `async` and takes `agentIdentifier?: string`.

## Customizations

### Linux/Docker adaptation — container-runtime.ts

**Intent:** This fork runs on bare-metal Linux with Docker (not macOS with Apple Container). Several adaptations make container-runtime.ts work correctly in this environment.

**Files:** `src/container-runtime.ts`, `container/build.sh`

**How to apply:**

Apply after merging `skill/apple-container` (which introduces the credential proxy and container runtime structure). The apple-container skill creates a version with Apple Container-specific networking. Replace the entire top section with Docker equivalents.

#### 1. Hardcode Docker runtime and add host gateway constant

In `src/container-runtime.ts`, replace apple-container's `CONTAINER_RUNTIME_BIN = 'container'` and `detectHostGateway()` with:

```typescript
/** The container runtime binary name. */
export const CONTAINER_RUNTIME_BIN = 'docker';

/** Hostname containers use to reach the host machine. */
export const CONTAINER_HOST_GATEWAY = 'host.docker.internal';
```

#### 2. Add Linux-aware credential proxy bind host detection

Replace apple-container's `PROXY_BIND_HOST` (which throws if not set) with:

```typescript
export const PROXY_BIND_HOST =
  process.env.CREDENTIAL_PROXY_HOST || detectProxyBindHost();

function detectProxyBindHost(): string {
  if (os.platform() === 'darwin') return '127.0.0.1';

  // WSL uses Docker Desktop (same VM routing as macOS) — loopback is correct.
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

#### 3. Auto-start Docker via systemd on Linux

In `ensureContainerRuntimeRunning()`, use `docker info` to check (not `docker system status`) and `sudo systemctl start docker` to start:

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
      // ... error banner ...
      throw new Error('Container runtime is required but failed to start');
    }
  }
}
```

#### 4. Fix `cleanupOrphans()` to use Docker ps format

Docker `ps` returns newline-separated container names, not JSON:

```typescript
const output = execSync(
  `${CONTAINER_RUNTIME_BIN} ps --filter name=nanoclaw- --format "{{.Names}}"`,
  { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' },
);
const orphans = output
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l.startsWith('nanoclaw-'));
```

#### 5. Fix `hostGatewayArgs()` for Linux

```typescript
export function hostGatewayArgs(): string[] {
  if (os.platform() === 'linux') {
    return ['--add-host=host.docker.internal:host-gateway'];
  }
  return [];
}
```

#### 6. Fix container build script default runtime

In `container/build.sh`, change the default runtime from `container` back to `docker`:

```bash
CONTAINER_RUNTIME="${CONTAINER_RUNTIME:-docker}"
```

#### 7. Fix test mocks for Docker

In `src/container-runtime.test.ts`:
- Change `docker system status` → `docker info`
- Change `docker system start` → `sudo systemctl start docker`
- Change `cleanupOrphans` test data from Apple Container JSON to Docker `ps` newline format

In `src/container-runner.test.ts`:
- Add `OLLAMA_ADMIN_TOOLS: false` and `ONECLI_URL: 'http://localhost:10254'` to config mock
- Remove `CREDENTIAL_PROXY_PORT` from config mock
- Add `@onecli-sh/sdk` mock (class-based, not `vi.fn().mockImplementation`):
  ```typescript
  vi.mock('@onecli-sh/sdk', () => {
    class OneCLI {
      applyContainerConfig = vi.fn(async () => true);
      constructor(_opts: unknown) {}
    }
    return { OneCLI };
  });
  ```
- Remove `credential-proxy.js` mock (detectAuthMode no longer used)

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
