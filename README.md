# AnyGen CLI

Command-line tool for [AnyGen](https://www.anygen.io) — an AI-powered content generation platform. Supports slides/PPT, documents, diagrams, websites, data analysis, research reports, storybooks, financial analysis, and image design.

## Features

- **Discovery-driven**: Automatically fetches the API schema from the server — commands stay in sync with the latest API
- **L3 helper commands**: `task +run` and `message +chat` combine multiple API calls into single workflows
- **Agent Skills**: Generates SKILL.md files for AI agent platforms (OpenClaw, Claude Code) so agents can drive AnyGen autonomously
- **Auto-auth**: Seamless web login flow — prints a URL, waits for authorization, saves the key automatically
- **Background-friendly output**: Final results are printed as compact `[RESULT]` JSON, fitting within the 400-char tail budget of background exec notifications

## Install

```bash
npm install -g @anygen/cli
```

Requires Node.js >= 18.

## Authentication

```bash
# Interactive web login
anygen auth login

# Or set an API key directly
anygen auth login --api-key sk-xxx

# Or via environment variable
export ANYGEN_API_KEY=sk-xxx

# Check status
anygen auth status

# Logout
anygen auth logout
```

## Quick Start

```bash
# Create a slide deck and download it
anygen task +run --operation slide --prompt "Q4 board review deck" --output-dir ./output

# Create a document
anygen task +run --operation doc --prompt "Technical design doc for auth system" --export-format docx --output-dir ./output

# Generate a diagram
anygen task +run --operation smart_draw --prompt "Microservice architecture diagram" --output-dir ./output

# Modify an existing task
anygen message +chat --task-id <id> --content "Change the title to Overview"
```

## Commands

### Helper Commands (L3)

These combine multiple API calls into a single blocking workflow:

| Command | Description |
|---------|-------------|
| `anygen task +run` | Create task → poll until done → download output |
| `anygen message +chat` | Send modification → poll until done |

**task +run flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--operation` | Yes | Operation type (slide, doc, smart_draw, etc.) |
| `--prompt` | Yes | Task description |
| `--file-tokens` | — | File tokens from `file upload` (JSON array) |
| `--export-format` | — | Export format (docx, drawio, excalidraw) |
| `--output-dir` | — | Download output to local directory |
| `--timeout` | — | Polling timeout in milliseconds |

**message +chat flags:**

| Flag | Required | Description |
|------|----------|-------------|
| `--task-id` | Yes | Task ID to modify |
| `--content` | Yes | Modification message |
| `--file-tokens` | — | File tokens from `file upload` (JSON array) |
| `--timeout` | — | Polling timeout in milliseconds |

### Dynamic Commands

All API resources and methods are auto-registered from the Discovery Document:

```bash
# Browse resources
anygen --help

# Call any API method
anygen task create --params '{"operation":"slide","prompt":"Q4 deck"}'
anygen task get --params '{"task_id":"xxx"}'
anygen file upload --file ./data.csv

# Inspect method schema
anygen schema task.create
```

### Static Commands

| Command | Description |
|---------|-------------|
| `anygen auth login` | Authenticate via web login or API key |
| `anygen auth status` | Show current auth status |
| `anygen auth logout` | Remove stored API key |
| `anygen skill install` | Install Agent Skills to a platform |
| `anygen skill list` | List available skill operations |

## Supported Operations

| Operation | Type | Export | Time |
|-----------|------|--------|------|
| `slide` | Slide / PPT | — | 10-15 min |
| `doc` | Document / DOCX | docx | 10-15 min |
| `smart_draw` | Diagram (SmartDraw) | drawio | 30-60 sec |
| `deep_research` | Deep Research Report | — | 10-20 min |
| `data_analysis` | Data Analysis (CSV) | — | 10-15 min |
| `finance` | Financial Research | — | 10-15 min |
| `storybook` | Storybook / Visuals | — | 10-15 min |
| `website` | Website | — | 10-15 min |
| `ai_designer` | Image Design | — | 5-10 min |

## Agent Skills

AnyGen CLI can generate SKILL.md files for AI agent platforms. These files teach agents how to use AnyGen — including authentication, requirements gathering, task creation, and modification.

```bash
# Install to OpenClaw (default)
anygen skill install --platform openclaw

# Install to Claude Code
anygen skill install --platform claude-code

# Install specific skills only
anygen skill install --name slide-generator,doc-generator

# Install to custom directory
anygen skill install --dir ./my-skills

# List available skills
anygen skill list
```

### Generated Skills

| Skill | Description |
|-------|-------------|
| `anygen` | Main routing skill — matches user requests to operations |
| `anygen-slide-generator` | Slide / PPT generation |
| `anygen-doc-generator` | Document / DOCX generation |
| `anygen-diagram-generator` | Diagram generation (SmartDraw) |
| `anygen-deep-research` | Deep research reports |
| `anygen-data-analysis` | CSV data analysis |
| `anygen-financial-research` | Financial research |
| `anygen-storybook-generator` | Storybook / creative visuals |
| `anygen-website-generator` | Website generation |
| `anygen-image-generator` | Image design |

## Architecture

```
src/
├── index.ts              # Entry point, two-phase startup
├── version.ts            # CLI version constant
├── api/
│   ├── client.ts         # HTTP client for API calls
│   └── auth.ts           # Auth flows (verify, web login, poll)
├── commands/
│   ├── auth-cmd.ts       # auth login/status/logout
│   ├── dynamic.ts        # Discovery-driven command registration
│   ├── task-run.ts       # L3: task +run
│   ├── message-modify.ts # L3: message +chat
│   ├── poll.ts           # Task/message polling utilities
│   ├── result.ts         # Background-friendly result output
│   ├── skill-cmd.ts      # skill install/list
│   └── render-cmd.ts     # Diagram rendering helper
├── config/
│   └── config.ts         # Config loading (flag > env > file)
├── discovery/
│   ├── client.ts         # Discovery Document fetcher + cache
│   └── types.ts          # Discovery Document types
├── render/
│   └── diagram.ts        # drawio/excalidraw → PNG rendering
├── security/
│   ├── sanitize.ts       # Response sanitization
│   └── validate.ts       # URL/path/filename validation
└── skills/
    ├── generator.ts      # SKILL.md file generator
    └── operations.ts     # Operation definitions (9 types)
```

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run dev -- task +run --operation slide --prompt "test"

# Type check
npm run typecheck

# Lint
npm run lint

# Run tests
npm test

# Build
npm run build

# Regenerate skill files
npx tsx src/index.ts skill generate --output skills
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANYGEN_API_KEY` | API key for authentication |

## License

MIT
