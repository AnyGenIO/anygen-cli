# anygen-cli

CLI for [AnyGen](https://www.anygen.io) — AI content generation platform. Generate slides, documents, diagrams, websites, research reports, and more from the terminal.

Auto-generates commands from a Discovery Document, with structured JSON output for AI Agent integration.

## Install

```bash
npm install -g @anygen/cli
```

Requires Node.js >= 18.

## Quick Start

```bash
# 1. Authenticate
anygen auth login

# 2. Create a task
anygen task create --data '{"operation":"slide","prompt":"Q4 board review"}'

# 3. Wait for completion
anygen task get --params '{"task_id":"xxx"}' --wait

# 4. Download artifacts
anygen task +download --task-id xxx
```

## Authentication

```bash
anygen auth login                  # Web login (opens browser)
anygen auth login --api-key sk-xxx # Direct API key
export ANYGEN_API_KEY=sk-xxx       # Environment variable

anygen auth status                 # Check current auth
anygen auth logout                 # Remove stored key
```

Priority: `--api-key` flag > `ANYGEN_API_KEY` env > config file (`~/.config/anygen/config.json`).

## Commands

### Dynamic Commands (auto-generated from API)

```bash
# Create task (POST → --data)
anygen task create --data '{"operation":"slide","prompt":"Q4 deck"}'

# Get task (URL params → --params)
anygen task get --params '{"task_id":"xxx"}'

# Send modification (URL params + body → --params + --data)
anygen task message send --params '{"task_id":"xxx"}' --data '{"content":"change title"}'

# Upload file
anygen file upload --data '{"file":"./data.csv"}'

# Poll until complete
anygen task get --params '{"task_id":"xxx"}' --wait
```

### Helper Commands

```bash
# Download artifacts from a completed task
anygen task +download --task-id xxx --output-dir ./output

# Download thumbnail preview
anygen task +download --task-id xxx --thumbnail
```

### Schema Inspection

```bash
# JSON output
anygen schema task.create

# Human-readable with colors, required markers, enum values
anygen schema task.create --pretty

# Dry run — preview request without sending
anygen task create --data '{"operation":"slide","prompt":"test"}' --dry-run
```

### Skill Installation

```bash
# Interactive — select platforms with arrow keys
anygen skill install

# Non-interactive — all platforms
anygen skill install -y

# Specific platform
anygen skill install --platform claude-code -y

# List available skills
anygen skill list
```

## Options

| Option | Description |
|--------|-------------|
| `--params <json>` | URL/path parameters as JSON |
| `--data <json>` | Request body as JSON (POST/PUT) |
| `--dry-run` | Preview request without sending |
| `--wait` | Poll until terminal state (task.get / message.list) |
| `--timeout <ms>` | Polling timeout in milliseconds |

## Error Handling

All errors output structured JSON to stdout:

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

Error types: `validation`, `auth`, `permission`, `rate_limit`, `api_error`, `network`, `internal`.

See [docs/error-handling.md](docs/error-handling.md) for details.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  CLI Entry (commander)            │
│  auth | schema | skill                           │
├──────────┬───────────────────────────────────────┤
│ Dynamic  │         Helpers (+)                    │
│ Commands │         task +download                 │
│ (auto)   │         (hand-written)                 │
├──────────┴───────────────────────────────────────┤
│               api/client                          │
│  HTTP client · path params · file upload          │
├──────────────────────────────────────────────────┤
│               Infrastructure                      │
│  Config · Web Auth · Discovery Doc Cache          │
└──────────────────────────────────────────────────┘
```

- **Dynamic Commands**: Auto-generated from AnyGen Discovery Document at runtime
- **Helpers**: Hand-written wrappers for complex operations (download + render)
- **Skills**: SKILL.md files for AI Agent integration (Claude Code, OpenClaw)

## Project Structure

```
├── src/
│   ├── index.ts              # Entry point, two-phase startup
│   ├── version.ts            # CLI version (single source of truth)
│   ├── errors.ts             # Error types, classification, JSON output
│   ├── api/
│   │   ├── client.ts         # HTTP client (callApi)
│   │   └── auth.ts           # Auth flow (web login, key verification)
│   ├── commands/
│   │   ├── auth-cmd.ts       # auth login/status/logout
│   │   ├── dynamic.ts        # Dynamic command registration from Discovery Document
│   │   ├── execute.ts        # Command execution engine (auth → validate → call → output)
│   │   ├── schema-cmd.ts     # schema command (JSON + --pretty output)
│   │   ├── task-download.ts  # Helper: task +download
│   │   ├── poll.ts           # Polling utilities (--wait)
│   │   └── skill-cmd.ts      # skill install/list
│   ├── config/
│   │   ├── config.ts         # Config loading (flag > env > file)
│   │   └── internal-fields.ts # Fields hidden from user output
│   ├── discovery/
│   │   ├── client.ts         # Discovery Document fetch + cache
│   │   └── types.ts          # Discovery Document types
│   ├── render/
│   │   └── diagram.ts        # drawio/excalidraw → PNG rendering
│   ├── security/
│   │   └── validate.ts       # URL/path/filename security checks
│   ├── skills/
│   │   └── generator.ts      # SKILL.md generator
│   └── utils/
│       ├── download.ts       # File download with security validation
│       └── prompt.ts         # Interactive prompts (select, multi-select, confirm)
├── skills/                   # Generated skill files (shipped with npm)
├── docs/
│   ├── design-spec.md        # Design spec and architecture
│   ├── error-handling.md     # Error handling architecture
│   └── testcase.md           # Test case documentation
└── package.json
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANYGEN_API_KEY` | API key for authentication |

## Development

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript
npm test             # Run tests
npx tsc --noEmit     # Type check only

# Dev mode (no compile needed)
npx tsx src/index.ts task create --help
```

## License

MIT
