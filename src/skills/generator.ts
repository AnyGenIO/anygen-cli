/**
 * Skill file generator
 *
 * Generates three SKILL.md files:
 * - anygen/SKILL.md           — shared: auth, CLI syntax, discovering commands, security
 * - anygen-generate/SKILL.md  — workflow: the full content generation flow
 * - anygen-download/SKILL.md  — helper: +download command usage
 */

const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function installMetadata(): string {
  return `  install:
    - id: node
      kind: node
      package: "@anygen/cli"
      bins: ["anygen"]`;
}

// ---------------------------------------------------------------------------
// anygen (shared)
// ---------------------------------------------------------------------------

function generateSharedSkill(): string {
  return `---
name: anygen-shared
version: ${VERSION}
description: "anygen CLI: Shared patterns for authentication, global flags, and output formatting."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
${installMetadata()}
---

# anygen — Shared Reference

## Authentication

\`\`\`bash
# Web login (recommended for agent usage)
anygen auth login --no-wait

# Direct API key (no browser needed)
anygen auth login --api-key sk-xxx

# Environment variable
export ANYGEN_API_KEY=sk-xxx
\`\`\`

## CLI Syntax

\`\`\`bash
anygen <resource> <method> [flags]
\`\`\`

### Method Flags

| Flag | Description |
|------|-------------|
| \`--params '<json>'\` | URL/path parameters |
| \`--data '<json>'\` | Request body |
| \`--dry-run\` | Show the request without sending it |
| \`--wait\` | Re-poll until terminal state (task.get / message.list) |
| \`--timeout <ms>\` | Polling timeout in milliseconds |

## Discovering Commands

\`\`\`bash
# Browse all resources and methods
anygen --help
anygen task --help

# Inspect a method's required params, types, and defaults
anygen schema task.create
anygen schema task.message.send
\`\`\`

Use \`anygen schema\` output to build your \`--params\` and \`--data\` flags.

## Security Rules

- **Never** output API keys or auth tokens directly.
- **Always** confirm with user before uploading files or creating tasks.
- **Never** upload or read any file without explicit user consent.
- Use natural language. Never expose task_id, file_token, or CLI syntax to the user.
- Always return links using Markdown format: \`[text](url)\`.
`;
}

// ---------------------------------------------------------------------------
// anygen-generate (workflow)
// ---------------------------------------------------------------------------

function generateWorkflowSkill(): string {
  return `---
name: anygen-workflow-generate
version: ${VERSION}
description: "AnyGen: Generate slides, presentations, documents, diagrams, images, websites, research reports, data analysis, and more."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
${installMetadata()}
  cliHelp: "anygen --help"
---

# Content Generation Workflow

> **PREREQUISITE:** Read [\`../anygen-shared/SKILL.md\`](../anygen-shared/SKILL.md) for auth, global flags, and security rules.

## Steps

1. **Upload reference files** (optional, confirm with user first):
   \`anygen file upload --data '{"file":"./data.csv"}'\`
   → Save \`file_token\` for step 3. Tell user the file was uploaded.

2. **Gather requirements** (optional, for unclear requirements):
   \`anygen task prepare --data '{"operation":"slide","messages":[{"role":"user","content":"Make a Q4 report PPT"}]}'\`
   Present \`reply\` to user, collect their answer, then call again with \`prepare_session_id\` and updated \`messages\`:
   \`anygen task prepare --data '{"operation":"slide","prepare_session_id":"<id>","messages":[...previous messages...,{"role":"user","content":"user's answer"}]}'\`
   Repeat until \`status=ready\`. Use \`suggested_task_params.prompt\` in step 3.
   → When ready, show the suggested outline and confirm before proceeding.

3. **Create task**:
   \`anygen task create --data '{"operation":"slide","prompt":"..."}'\`
   → Tell user the task is created, share \`task_url\` and estimated time.

4. **Wait & deliver**:
   \`anygen task get --params '{"task_id":"<id>"}' --wait\` (long-running, run in background)
   \`anygen task +download --task-id <id> --thumbnail\`
   → Send thumbnail preview with \`task_url\`. Ask user if they want to request changes or download the file.

5. **Download** (on user request):
   \`anygen task +download --task-id <id>\`
   → Send the downloaded file to user.

6. **Modify** (on user request):
   \`anygen task message send --params '{"task_id":"<id>"}' --data '{"content":"..."}'\`
   \`anygen task message list --params '{"task_id":"<id>"}' --wait\` (long-running, run in background)
   → Repeat step 4 to show updated preview. All modifications reuse the same task.

## Tips

- Run \`anygen task operations\` to discover supported operation types, estimated times, export formats, and thumbnail availability.
- Run \`anygen schema <resource.method>\` to check required params and response format before calling any method.
- Always show thumbnail preview if available. List all output files and ask if user wants to download.
- Long-running commands (\`--wait\`) should be run in the background or delegated to a sub-agent to avoid blocking.

## See Also

- [\`anygen-task-download\`](../anygen-task-download/SKILL.md) — Download artifacts from a completed task
`;
}

// ---------------------------------------------------------------------------
// anygen-download (helper)
// ---------------------------------------------------------------------------

function generateDownloadSkill(): string {
  return `---
name: anygen-task-download
version: ${VERSION}
description: "AnyGen: Download artifacts from a completed task."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
${installMetadata()}
  cliHelp: "anygen task +download --help"
---

# task +download

> **PREREQUISITE:** Read [\`../anygen-shared/SKILL.md\`](../anygen-shared/SKILL.md) for auth, global flags, and security rules.

Download artifacts from a completed task.

## Usage

\`\`\`bash
anygen task +download --task-id <id> --output-dir <dir>
\`\`\`

## Flags

| Flag | Required | Description |
|------|----------|-------------|
| \`--task-id\` | ✓ | Task ID |
| \`--output-dir\` | — | Local directory to save files (default: current directory) |
| \`--thumbnail\` | — | Download thumbnail image instead of main file |

## Examples

\`\`\`bash
# Download main file
anygen task +download --task-id xxx

# Download thumbnail (for preview)
anygen task +download --task-id xxx --thumbnail

# Specify output directory
anygen task +download --task-id xxx --output-dir ./output
\`\`\`

## Tips

- The task must be in \`completed\` state. Use \`task get --wait\` first if needed.
- Use \`--thumbnail\` first to show a preview, then download the main file when user requests it.
- For smart_draw tasks, the main file is automatically rendered to PNG.

> [!CAUTION]
> This is a **write** command (writes files to disk) — confirm the output directory with the user.

## See Also

- [\`anygen-workflow-generate\`](../anygen-workflow-generate/SKILL.md) — Full content generation workflow
`;
}

// ---------------------------------------------------------------------------
// Generate all skill files
// ---------------------------------------------------------------------------

export interface SkillFile {
  path: string;
  content: string;
}

export function generateAllSkillFiles(): SkillFile[] {
  return [
    { path: 'anygen-shared/SKILL.md', content: generateSharedSkill() },
    { path: 'anygen-workflow-generate/SKILL.md', content: generateWorkflowSkill() },
    { path: 'anygen-task-download/SKILL.md', content: generateDownloadSkill() },
  ];
}
