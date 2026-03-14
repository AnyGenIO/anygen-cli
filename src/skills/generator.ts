/**
 * Skill file generator
 *
 * Generates SKILL.md files:
 * - anygen/SKILL.md          — main skill: API resources, helper commands, operation routing
 * - anygen-{name}/SKILL.md   — per-operation skills: workflow, tips
 */

import { OPERATIONS, type OperationDef } from './operations.js';

const VERSION = '1.0.0';

// ---------------------------------------------------------------------------
// Shared sections
// ---------------------------------------------------------------------------

function authSection(): string {
  return `## Authentication

If not authenticated, run \`anygen auth login\` in the background (see Background Execution). Once complete, proceed with the workflow.

Alternatively, set the API key directly:

\`\`\`bash
export ANYGEN_API_KEY=sk-xxx
\`\`\``;
}

function discoveringSection(): string {
  return `## Discovering Commands

\`\`\`bash
# Browse all resources and methods
anygen --help

# Inspect a specific method's required params, types, and defaults
anygen schema <resource>.<method>
\`\`\``;
}

function backgroundSection(taskDuration: string): string {
  return `## Background Execution

The following commands are blocking — always run them in the background:

| Command | Duration |
|---------|----------|
| \`anygen auth login\` | Until user completes web login |
| \`anygen task +run\` | ${taskDuration} |
| \`anygen message +chat\` | 1-10 minutes |

Tell the user the operation is in progress while waiting.

**Output format:** Commands print a final \`[RESULT] {...}\` JSON on completion with key fields (\`status\`, \`task_id\`, \`preview_url\`, \`thumbnail_url\`, \`file_path\`). If the result exceeds the inline limit, it is saved to a temp file — the output will read \`[RESULT] Output saved to <path>\`, read that file for the full result.`;
}

function tipsSection(): string {
  return `## Tips

- Always return links using Markdown format: \`[text](url)\` — this allows users to click them directly.`;
}

function securitySection(): string {
  return `## Security Rules

- **Never** output API keys or auth tokens directly.
- **Always** confirm with user before uploading files or creating tasks.
- **Never** upload or read any file without explicit user consent.
- Use natural language. Never expose task_id, file_token, or CLI syntax to the user.`;
}

function seeAlsoSection(): string {
  return `## See Also

You can run \`anygen skill list\` to see all available skills, or \`anygen skill install --platform <name>\` to install.`;
}

function installMetadata(): string {
  return `  install:
    - id: node
      kind: node
      package: "@anygen/cli"
      bins: ["anygen"]`;
}

// ---------------------------------------------------------------------------
// Main routing SKILL.md
// ---------------------------------------------------------------------------

export function generateMainSkill(): string {
  const operationRows = OPERATIONS.map((op) => {
    const fmt = op.exportFormat || '—';
    return `| \`${op.name}\` | ${op.title} | ${fmt} | ${op.estimatedTime} | ${op.triggers} |`;
  }).join('\n');

  return `---
name: anygen
version: ${VERSION}
description: "AnyGen: AI-powered content generation. Supports slides/PPT, documents, diagrams, websites, data analysis, research reports, storybooks, financial analysis, images."
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
${installMetadata()}
  cliHelp: "anygen --help"
---

# anygen

${authSection()}

## Operations

Match user request to an operation based on triggers.

| Operation | Type | Export Format | Estimated Time | Triggers |
|-----------|------|--------------|----------------|----------|
${operationRows}

## Helper Commands

### task +run

Create a task, poll until completed or failed, and optionally download the output file.

\`\`\`bash
anygen task +run --operation <name> --prompt <text> [flags]
\`\`\`

| Flag | Required | Description |
|------|----------|-------------|
| \`--operation\` | ✓ | Operation type |
| \`--prompt\` | ✓ | Task description / prompt |
| \`--file-tokens\` | — | File tokens from file.upload (JSON array) |
| \`--export-format\` | — | Export format |
| \`--output-dir\` | — | Download output file to local directory |
| \`--timeout\` | — | Polling timeout in milliseconds |

### message +chat

Send a modification message to a completed task, then poll until the modification finishes.

\`\`\`bash
anygen message +chat --task-id <id> --content <text> [flags]
\`\`\`

| Flag | Required | Description |
|------|----------|-------------|
| \`--task-id\` | ✓ | Task ID to modify |
| \`--content\` | ✓ | Modification message |
| \`--file-tokens\` | — | File tokens from file.upload (JSON array) |
| \`--timeout\` | — | Polling timeout in milliseconds |

${discoveringSection()}

${backgroundSection('Varies by operation (see Operations table)')}

## Workflow

### 1. Upload Files (if user provides reference files)

Get user consent before reading or uploading any file. Upload with \`anygen file upload\`.
Response includes \`file_token\` — reuse it if the same file was already uploaded in this conversation.

### 2. Gather Requirements

Call \`anygen task prepare\` in a loop. Present \`reply\` to user as-is (translate if needed, but do NOT rephrase or summarize). Collect the user's answer, call again with updated \`history\`.
Repeat until response \`status=ready\` with \`suggested_task_params\`.

### 3. Confirm with User

When \`status=ready\`, present the \`reply\` and \`prompt\` from \`suggested_task_params\` to the user as the content outline. NEVER auto-create without explicit user approval. If the user requests adjustments, call \`prepare\` again and re-present until approved.

### 4. Create & Wait

Run \`anygen task +run --operation <name> --prompt '...' --output-dir ./output\` in the background.
Tell the user the content is being generated and they can continue chatting.

When complete, notify the user with:
- The preview URL
- Thumbnail or preview images (if available)
- Ask if they want to download the file locally (if available)

### 5. Modify

Run \`anygen message +chat --task-id <id> --content "..."\` in the background.
When complete, share the updated preview with the user.

All modifications use the same task — do NOT create a new task.

${tipsSection()}

${securitySection()}

${seeAlsoSection()}
`;
}

// ---------------------------------------------------------------------------
// Per-operation SKILL.md
// ---------------------------------------------------------------------------

function operationSkillName(op: OperationDef): string {
  return op.trackingName;
}

export function generateStandaloneSkill(op: OperationDef): string {
  const skillName = operationSkillName(op);
  const descYaml = op.description.replace(/"/g, '\\"');

  const notes = op.notes
    ? '\n' + op.notes.map((n) => `> ${n}`).join('\n') + '\n'
    : '';

  const estTime = op.estimatedTime;
  const pollTimeoutMs = op.pollTimeoutSeconds * 1000;

  // task +run optional flags (operation-specific defaults)
  const taskRunOptionalFlags: string[] = [];
  taskRunOptionalFlags.push('| `--file-tokens` | — | — | File tokens from file.upload (JSON array) |');
  if (op.exportFormat) {
    taskRunOptionalFlags.push(`| \`--export-format\` | — | ${op.exportFormat} | Export format |`);
  } else {
    taskRunOptionalFlags.push('| `--export-format` | — | — | Export format (e.g. docx, drawio, excalidraw) |');
  }
  taskRunOptionalFlags.push('| `--output-dir` | — | — | Download output file to local directory |');
  taskRunOptionalFlags.push(`| \`--timeout\` | — | ${pollTimeoutMs} | Polling timeout in milliseconds |`);

  // Step 4 completion: what to do when task finishes
  const completionSteps: string[] = [
    `- The preview URL`,
    '- Thumbnail or preview images (if available)',
  ];
  if (op.outputFileType) {
    completionSteps.push(`- Ask if they want to download the file locally (${op.outputFileType})`);
  }

  return `---
name: anygen-${skillName}
version: ${VERSION}
description: "${descYaml}"
metadata:
  requires:
    bins: ["anygen"]
    env: ["ANYGEN_API_KEY"]
${installMetadata()}
  cliHelp: "anygen --help"
---

# ${op.name}
${notes}
${authSection()}

## Helper Commands

### task +run

Create a task, poll until completed or failed, and optionally download the output file.

\`\`\`bash
anygen task +run --operation ${op.name} --prompt <text> [flags]
\`\`\`

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| \`--prompt\` | ✓ | — | Task description / prompt |
${taskRunOptionalFlags.join('\n')}

### message +chat

Send a modification message to a completed task, then poll until the modification finishes.

\`\`\`bash
anygen message +chat --task-id <id> --content <text> [flags]
\`\`\`

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| \`--task-id\` | ✓ | — | Task ID to modify |
| \`--content\` | ✓ | — | Modification message |
| \`--file-tokens\` | — | — | File tokens from file.upload (JSON array) |
| \`--timeout\` | — | ${pollTimeoutMs} | Polling timeout in milliseconds |

${discoveringSection()}

${backgroundSection(`~${estTime}`)}

## Workflow

### 1. Upload Files (if user provides reference files)

Get user consent before reading or uploading any file. Upload with \`anygen file upload\`.
Response includes \`file_token\` — reuse it if the same file was already uploaded in this conversation.

### 2. Gather Requirements

Call \`anygen task prepare\` in a loop. Present \`reply\` to user as-is (translate if needed, but do NOT rephrase or summarize). Collect the user's answer, call again with updated \`history\`.
Repeat until response \`status=ready\` with \`suggested_task_params\`.

### 3. Confirm with User

When \`status=ready\`, present the \`reply\` and \`prompt\` from \`suggested_task_params\` to the user as the content outline. NEVER auto-create without explicit user approval. If the user requests adjustments, call \`prepare\` again and re-present until approved.

### 4. Create & Wait

Run \`anygen task +run --operation ${op.name} --prompt '...' --output-dir ./output\` in the background.
Tell the user: the ${op.contentName} is being generated, and they can continue chatting.

When complete, notify the user with:
${completionSteps.join('\n')}

### 5. Modify

Run \`anygen message +chat --task-id <id> --content "..."\` in the background.
When complete, share the updated preview with the user.

All modifications use the same task — do NOT create a new task.

${tipsSection()}

${securitySection()}

${seeAlsoSection()}
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
  const files: SkillFile[] = [];

  files.push({ path: 'anygen/SKILL.md', content: generateMainSkill() });

  for (const op of OPERATIONS) {
    const skillName = operationSkillName(op);
    files.push({
      path: `anygen-${skillName}/SKILL.md`,
      content: generateStandaloneSkill(op),
    });
  }

  return files;
}
