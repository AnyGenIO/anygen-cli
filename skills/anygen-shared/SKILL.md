---
name: anygen-shared
version: 1.0.0
description: "anygen CLI: Shared patterns for authentication, global flags, and output formatting."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
  install:
    - id: node
      kind: node
      package: "@anygen/cli"
      bins: ["anygen"]
---

# anygen — Shared Reference

## Authentication

```bash
# Web login (non-blocking, returns auth URL immediately)
anygen auth login --no-wait

# Web login (interactive, polls until user authorizes)
anygen auth login

# Direct API key
anygen auth login --api-key sk-xxx

# Environment variable
export ANYGEN_API_KEY=sk-xxx
```

> **Tip:** Prefer `--no-wait` for agent usage — it prints the auth URL and saves a `fetch_token` to config, then exits immediately. The next CLI command will automatically exchange the `fetch_token` for an API key once the user completes authorization in the browser.

## CLI Syntax

```bash
anygen <resource> <method> [flags]
```

### Method Flags

| Flag | Description |
|------|-------------|
| `--params '<json>'` | URL/path parameters |
| `--data '<json>'` | Request body |
| `--dry-run` | Show the request without sending it |
| `--wait` | Re-poll until terminal state (task.get / message.list) |
| `--timeout <ms>` | Polling timeout in milliseconds |

## Discovering Commands

```bash
# Browse all resources and methods
anygen --help
anygen task --help

# Inspect a method's required params, types, and defaults
anygen schema task.create
anygen schema task.message.send
```

Use `anygen schema` output to build your `--params` and `--data` flags.

## Security Rules

- **Never** output API keys or auth tokens directly.
- **Always** confirm with user before uploading files or creating tasks.
- **Never** upload or read any file without explicit user consent.
- Use natural language instead of exposing task_id, file_token, or CLI syntax to the user.
- Always return links using Markdown format: `[text](url)`.
