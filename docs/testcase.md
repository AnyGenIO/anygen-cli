# anygen-cli Test Cases

> Covers CLI global capabilities, task lifecycle, error handling, and skill installation.

---

## 1. Global Capabilities

### 1.1 Help System

| # | Command | Expected | Status |
|---|---------|----------|--------|
| G-01 | `anygen` (no args) | Custom help: USAGE, EXAMPLES, RESOURCES, COMMANDS, OPTIONS, ENVIRONMENT | |
| G-02 | `anygen --help` | Same as G-01 | |
| G-03 | `anygen task --help` | Description first, then Usage, then Commands list | |
| G-04 | `anygen task create --help` | Description + schema hint, then Usage, then Options | |
| G-05 | `anygen schema --help` | Shows `--pretty` flag | |
| G-06 | `anygen --version` | Shows version from version.ts | |
| G-07 | `anygen skill --help` | Shows install, list subcommands (no help subcommand) | |

### 1.2 Authentication

| # | Command | Expected | Status |
|---|---------|----------|--------|
| G-08 | `anygen auth login --no-wait` | Outputs auth URL to stdout, saves fetchToken, exits immediately | |
| G-08b | `anygen auth login` | Opens browser URL, polls for key, saves to config | |
| G-09 | `anygen auth login --api-key sk-xxx` | Verifies and saves key | |
| G-10 | `anygen auth status` | Shows API Key (masked), Source, Status, Credits | |
| G-11 | `anygen auth logout` | Removes key from config, warns if env var set | |
| G-12 | `ANYGEN_API_KEY=sk-xxx anygen auth status` | Source shows "ANYGEN_API_KEY env" | |
| G-13 | API command without auth | Returns auth error with hint, does NOT auto-trigger login | |
| G-14 | API command with pending fetchToken | Tries to exchange, returns "Authorization pending" if not yet authorized | |

### 1.3 Config Priority

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| G-13 | `--api-key` flag + env + config file all set | Flag wins | |
| G-14 | env + config file both set | Env wins | |
| G-15 | Only config file set | Config file used | |

---

## 2. Client-Side Validation

| # | Command | Expected | Status |
|---|---------|----------|--------|
| V-01 | `anygen task create` (no --data) | Error: Missing --data + Usage + hint to schema | |
| V-02 | `anygen task create --data '{"operation":"slide"}'` | Error: Missing required field "prompt" | |
| V-03 | `anygen task get` (no --params) | Error: Missing required parameter "task_id" | |
| V-04 | `anygen task create --data 'invalid'` | Error: Invalid --data JSON | |
| V-05 | `anygen task get --params 'invalid'` | Error: Invalid --params JSON | |

All validation errors should output:
- stderr: `Error: <message>` + Usage block
- stdout: `{"success":false,"error":{"type":"validation","message":"...","hint":"..."}}`

---

## 3. Server Error Classification

| # | Command | Expected type | Status |
|---|---------|--------------|--------|
| E-01 | `anygen task get --params '{"task_id":"task_nonexist"}'` | `api_error` (task not found) | |
| E-02 | Invalid API key → 100004003 | `auth` with hint | |
| E-03 | Rate limited → 100004006 | `rate_limit` with retry hint | |
| E-04 | Credits exhausted → 100006029 | `permission` with credits link | |
| E-05 | Network unreachable | `network` with retry hint | |

---

## 4. Schema Command

| # | Command | Expected | Status |
|---|---------|----------|--------|
| S-01 | `anygen schema` (no args) | Error with available methods list | |
| S-02 | `anygen schema task.create` | JSON output: id, description, httpMethod, path, request, response | |
| S-03 | `anygen schema task.create --pretty` | Human-readable: colored params, required/optional markers, enum values inline | |
| S-04 | `anygen schema task.get --pretty` | Shows --params fields, response with nested output object | |
| S-05 | `anygen schema nonexist` | Error: unknown resource | |
| S-06 | `anygen schema task.nonexist` | Error: method not found | |

---

## 5. Task Lifecycle

| # | Command | Expected | Status |
|---|---------|----------|--------|
| T-01 | `anygen task create --data '{"operation":"slide","prompt":"test"}'` | Returns `{"success":true,"task_id":"...","task_url":"..."}` | |
| T-02 | `anygen task get --params '{"task_id":"<id>"}'` | Returns task status, progress, output | |
| T-03 | `anygen task get --params '{"task_id":"<id>"}' --wait` | Polls until completed, outputs final JSON | |
| T-04 | `anygen task +download --task-id <id>` | Downloads file, outputs `{"status":"completed","file":"..."}` | |
| T-05 | `anygen task +download --task-id <id> --thumbnail` | Downloads thumbnail PNG | |
| T-06 | `anygen task message send --params '{"task_id":"<id>"}' --data '{"content":"change title"}'` | Sends modification | |
| T-07 | `anygen task message list --params '{"task_id":"<id>"}' --wait` | Polls until modification complete, outputs messages JSON | |

### 5.1 Dry Run

| # | Command | Expected | Status |
|---|---------|----------|--------|
| T-08 | `anygen task create --data '{"operation":"slide","prompt":"test"}' --dry-run` | Shows request JSON, no `extra` field, no API call | |
| T-09 | `anygen task get --params '{"task_id":"xxx"}' --dry-run` | Shows request URL with task_id substituted | |

---

## 6. Skill Installation

| # | Command | Expected | Status |
|---|---------|----------|--------|
| K-01 | `anygen skill install -y` | Installs all skills to all platforms, no interaction | |
| K-02 | `anygen skill install --platform claude-code -y` | Installs to Claude Code only | |
| K-03 | `anygen skill install --platform openclaw,claude-code -y` | Installs to both platforms | |
| K-04 | `anygen skill install` (interactive) | Multi-select platforms, confirm, install | |
| K-05 | `anygen skill list` | Table output of available skills | |
| K-06 | `anygen skill list --format json` | JSON array of skills | |

---

## 7. Edge Cases

| # | Scenario | Expected | Status |
|---|----------|----------|--------|
| X-01 | Discovery Document unavailable | Help still works, dynamic commands unavailable with warning | |
| X-02 | `anygen task +download --task-id <id>` on non-completed task | Error: Task is not completed | |
| X-03 | `anygen task +download --task-id <id> --thumbnail` with no thumbnail | Error: No thumbnail available | |
| X-04 | `--no-cache` flag | Forces re-fetch of Discovery Document | |
