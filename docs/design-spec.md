# AnyGen CLI Design Spec

Design constraints for command structure, I/O, error handling, security, and Agent friendliness.

> **Goal**: A CLI infrastructure suitable for long-term stable use by AI Agents, not just "a tool that calls AnyGen APIs".

---

## 1. Architecture

```
┌──────────────────────────────────────────────────┐
│                  CLI Entry (commander)            │
│  index.ts — auth | schema | skill                │
├──────────┬───────────────────────────────────────┤
│ Dynamic  │         Helpers (+)                    │
│ Commands │         task +download                 │
│(dynamic) │        (task-download)                 │
├──────────┴───────────────────────────────────────┤
│               execute.ts                          │
│  auth → validate → dry-run → callApi → poll      │
├──────────────────────────────────────────────────┤
│               api/client + utils/download         │
│  HTTP client · path params · file download        │
├──────────────────────────────────────────────────┤
│               Infrastructure                      │
│  Config · Web Auth · Discovery Doc Cache          │
└──────────────────────────────────────────────────┘
```

### Key Files

| File | Responsibility |
|------|---------------|
| `commands/dynamic.ts` | Command registration from Discovery Document |
| `commands/execute.ts` | Command execution engine (auth → validate → call → output) |
| `commands/schema-cmd.ts` | Schema introspection (JSON + `--pretty`) |
| `commands/poll.ts` | Polling utilities (`--wait`) |
| `utils/download.ts` | File download with security validation |
| `api/auth.ts` | Auth flow, accepts `baseUrl` from config (no hardcoded URLs) |

### Dynamic Commands

Auto-generated from AnyGen Discovery Document. All API resources and methods registered as CLI subcommands at runtime.

```bash
anygen <resource> <method> --params '<json>' --data '<json>'
```

### Helper Commands

Prefixed with `+`, co-exist with dynamic commands. Only created when raw API calling is insufficient.

```bash
anygen task +download --task-id <id>
```

---

## 2. Helper Admission Criteria

A Helper must satisfy **at least one**:

| Criteria | Meaning | Counter-example |
|----------|---------|-----------------|
| Multi-step orchestration | Chains ≥2 API calls | Single API query |
| Format conversion | Non-trivial input/output mapping | Simple JSON passthrough |
| Result aggregation | Combines scattered data into useful view | Single API list |
| Local processing | Local file ops (download, render, convert) | Pure API call |

**Should NOT be a Helper**: flag translation (splitting `--data` into individual flags), adding poll retry (that's `--wait`), reordering output fields.

### Current Helpers

| Helper | Admission reason |
|--------|-----------------|
| `task +download` | Local file download + smart_draw format conversion (drawio/excalidraw → PNG) |

---

## 3. Design Principles

### 3.1 Parameter Separation

| Flag | Purpose | Maps to |
|------|---------|---------|
| `--params '<json>'` | URL/path/query params | `method.parameters` |
| `--data '<json>'` | Request body | `method.request` |

CLI dispatches `--params` values to URL path or query string based on `location` field in Discovery Document.

### 3.2 Client-Side Validation

CLI validates locally before hitting the server:

```
1. Auth check (API key configured?)
2. JSON validity (--params / --data)
3. Required params check (against Discovery Document schema)
4. Required body fields check (against request schema)
5. File path security (path traversal, existence)
6. [dry-run exits here]
7. API call
8. Response classification (classifyServerError)
```

### 3.3 One Helper, One Scenario

No "universal Helpers". If a Helper needs many mutually exclusive groups, split it.

---

## 4. Output Design

### 4.1 JSON Envelope

**Success** — passthrough server response (includes `success: true`):

```json
{
  "success": true,
  "task_id": "task_xxx",
  "task_url": "https://www.anygen.io/task/xxx"
}
```

**Error** — structured envelope:

```json
{
  "success": false,
  "error": {
    "type": "validation",
    "message": "Missing --data (required fields: operation, prompt)",
    "hint": "Run: anygen schema task.create"
  }
}
```

### 4.2 stdout / stderr Separation

| Content | Target |
|---------|--------|
| JSON result (success or error envelope) | stdout |
| `Error:` message + Usage block | stderr |
| Polling progress | stderr |
| Interactive prompts (auth login, skill install) | stderr |

---

## 5. Error Design

See [error-handling.md](error-handling.md) for full specification.

### 5.1 Error Types

| type | Description |
|------|-------------|
| `validation` | Client-side parameter check failed |
| `auth` | Authentication failed |
| `permission` | Insufficient credits/permissions |
| `rate_limit` | Rate limited |
| `api_error` | General API error (catch-all) |
| `network` | Cannot reach server |
| `internal` | CLI bug |

### 5.2 Error Output Pattern

All errors: stderr shows `Error: <message>` + command Usage, stdout shows JSON envelope.

Aligned with larksuite-cli's cobra error pattern.

---

## 6. Help Design

### 6.1 Description Before Usage

All commands show description first, then Usage (overridden via `configureHelp.formatHelp` at program level):

```
Create a content generation task

View parameter definitions before calling:
  anygen schema task.create

Usage: anygen task create [options]

Options:
  --data <json>  Request body as JSON
  --dry-run      Show the request without sending it
  -h, --help     display help for command
```

### 6.2 Schema Hint

Dynamic method commands include schema hint in help description, guiding users/agents to `anygen schema <method.id>` for parameter details.

### 6.3 Top-Level Help

Custom `printHelp()` with structured sections: USAGE → EXAMPLES → RESOURCES → COMMANDS → OPTIONS → ENVIRONMENT.

---

## 7. Security

### 7.1 Risk Levels

| Level | Commands | Requirements |
|-------|----------|-------------|
| `read` | `task get`, `schema` | No restrictions |
| `write` | `task create`, `message send` | `--dry-run` support |
| `local-write` | `task +download` | Path validation, no overwrite |

### 7.2 Internal Fields

`INTERNAL_FIELDS` (`src/config/internal-fields.ts`) defines fields managed by CLI internally:
- `auth_token` — handled via Authorization header
- `extra` — auto-injected CLI tracking metadata

Hidden from: schema output, `--pretty` display, `--dry-run` output, client validation.

### 7.3 File Security

- Path traversal prevention (`..` blocked)
- Download URL validation (HTTPS only, no private IPs)
  - Blocked: localhost, `10.x`, `172.16-31.x`, `192.168.x`, `169.254.x` (link-local IPv4)
  - Blocked: `::1`, `fe80::` (link-local IPv6), `fc00::`/`fd00::` (unique local IPv6)
  - Blocked: `.local`, `.internal` domains
- File name sanitization
- No overwrite of existing files (auto-incrementing suffix)

---

## 8. Skill Design

### 8.1 Skill Layers

| Skill | Type | Content |
|-------|------|---------|
| `anygen-shared` | shared | Auth, CLI syntax, global flags, security rules |
| `anygen-workflow-generate` | workflow | Full content generation flow (6 steps) |
| `anygen-task-download` | helper | `+download` command usage |

### 8.2 Principles

- Each skill is self-contained, installable independently
- Dynamic data (supported operations, param definitions) discovered by AI via CLI at runtime
- Workflow skill `→` describes user-facing deliverables, not internal operations

---

## 9. Config & Auth

### 9.1 Single Config Instance

`loadConfig()` is called once in `main()`. The resulting `AnygenConfig` object is passed through to all subsystems:

- `ensureAuth(config)` — uses `config.baseUrl` and `config.apiKey`
- `executeMethod(method, opts, config, doc, cmd)` — passes config to auth + callApi
- `registerTaskHelpers(cmd, doc, config)` — passes config to task +download

No subsystem calls `loadConfig()` independently. This prevents stale key issues.

### 9.2 No Hardcoded URLs

`auth.ts` functions (`verifyKey`, `getKey`, `waitForKey`) all accept `baseUrl` as a parameter. The single source of truth for `BASE_URL` is `config.ts`.

### 9.3 Data-Driven Polling

The `--wait` flag is registered based on `method.supportsPolling` from Discovery Document. Until the server declares this field, CLI falls back to a hardcoded `POLLABLE_METHOD_IDS` set:

```typescript
method.supportsPolling ?? POLLABLE_METHOD_IDS.has(method.id)
```

Once the server adds `supportsPolling`, the fallback is automatically bypassed.

---

## 10. Anti-Patterns

| Anti-pattern | Problem | Correct approach |
|-------------|---------|-----------------|
| Single API wrapper | No orchestration value | Only create Helper when admission criteria met |
| stdout mixing | Progress pollutes JSON | Progress to stderr, data to stdout |
| Raw server passthrough | Upstream changes break callers | Classify errors, stable envelope |
| Hardcoded dynamic data | Every update requires skill change | AI discovers via CLI |
| One skill per operation | 95% content duplication | One workflow skill for all operations |
| Duplicate config loading | Stale keys, inconsistent state | Single `loadConfig()` in main, pass config down |
| Hardcoded URLs in subsystems | Cannot switch env/self-deploy | All URLs from config.baseUrl |
